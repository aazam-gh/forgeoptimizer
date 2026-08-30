export type GitHubRepository = {
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  baseCommitSha: string;
};
export type GitHubPullRequest = {
  number: number;
  url: string;
  head: string;
  base: string;
  title: string;
};
export type GitHubCommitFile = { path: string; content: string };
export type GitHubSourceFile = { path: string; content: string };

function repositoryPath(repositoryUrl: string): {
  owner: string;
  name: string;
} {
  const url = new URL(repositoryUrl);
  if (url.hostname !== "github.com")
    throw new Error("Only github.com repository URLs are supported");
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (parts.length !== 2 || !parts[0] || !parts[1])
    throw new Error("Repository URL must be https://github.com/{owner}/{repo}");
  return { owner: parts[0], name: parts[1].replace(/\.git$/, "") };
}

function token(): string {
  const value = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!value)
    throw new Error(
      "Server-side GITHUB_TOKEN is required for private repository access",
    );
  return value;
}

async function githubRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...init.headers,
    },
  });
  if (!response.ok)
    throw new Error(`GitHub ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

export async function inspectRepository(
  repositoryUrl: string,
  branch?: string,
): Promise<GitHubRepository> {
  const { owner, name } = repositoryPath(repositoryUrl);
  const repo = await githubRequest<{
    default_branch: string;
    private: boolean;
  }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
  const selectedBranch = branch ?? repo.default_branch;
  const ref = await githubRequest<{ object: { sha: string } }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/ref/heads/${encodeURIComponent(selectedBranch)}`,
  );
  return {
    owner,
    name,
    defaultBranch: selectedBranch,
    private: repo.private,
    baseCommitSha: ref.object.sha,
  };
}
export async function listRepositoryBranches(
  repositoryUrl: string,
): Promise<string[]> {
  const { owner, name } = repositoryPath(repositoryUrl);
  const branches = await githubRequest<Array<{ name: string }>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches?per_page=100`,
  );
  return branches.map((branch) => branch.name);
}
export async function inspectCommit(
  repositoryUrl: string,
  commitSha: string,
): Promise<{ repository: string; commitSha: string }> {
  if (!/^[0-9a-f]{7,64}$/i.test(commitSha))
    throw new Error("Commit SHA is invalid");
  const { owner, name } = repositoryPath(repositoryUrl);
  const commit = await githubRequest<{ sha: string }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(commitSha)}`,
  );
  return { repository: `${owner}/${name}`, commitSha: commit.sha };
}
export async function readRepositorySource(
  repositoryUrl: string,
  branch?: string,
  maxFiles = 200,
): Promise<GitHubSourceFile[]> {
  const repository = await inspectRepository(repositoryUrl, branch);
  const tree = await githubRequest<{
    tree: Array<{ path: string; type: string; sha: string; size?: number }>;
  }>(
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/git/trees/${encodeURIComponent(repository.baseCommitSha)}?recursive=1`,
  );
  const textPath =
    /\.(?:c|cc|cpp|css|go|java|js|jsx|json|md|py|rb|rs|sh|sql|swift|ts|tsx|vue|yaml|yml)$/i;
  const files = tree.tree
    .filter(
      (item) =>
        item.type === "blob" &&
        item.size !== undefined &&
        item.size <= 250_000 &&
        textPath.test(item.path),
    )
    .slice(0, maxFiles);
  return Promise.all(
    files.map(async (file) => {
      const blob = await githubRequest<{ content: string; encoding: string }>(
        `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/git/blobs/${encodeURIComponent(file.sha)}`,
      );
      if (blob.encoding !== "base64")
        throw new Error(`Unsupported encoding for ${file.path}`);
      return {
        path: file.path,
        content: Buffer.from(
          blob.content.replace(/\s/g, ""),
          "base64",
        ).toString("utf8"),
      };
    }),
  );
}

export async function createOptimizationBranch(
  repositoryUrl: string,
  baseBranch: string,
  branchName: string,
  selectedCommitSha?: string,
): Promise<{ repository: string; branchName: string; baseCommitSha: string }> {
  if (!/^forgeoptimizer\/run-[a-z0-9-]{4,80}$/.test(branchName))
    throw new Error(
      "Optimization branch must use forgeoptimizer/run-{short-id}",
    );
  const repository = await inspectRepository(repositoryUrl, baseBranch);
  const baseCommitSha = selectedCommitSha
    ? (await inspectCommit(repositoryUrl, selectedCommitSha)).commitSha
    : repository.baseCommitSha;
  await githubRequest(
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/git/refs`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseCommitSha,
      }),
    },
  );
  return {
    repository: `${repository.owner}/${repository.name}`,
    branchName,
    baseCommitSha,
  };
}

export async function commitOptimizationChanges(
  repositoryUrl: string,
  branchName: string,
  files: GitHubCommitFile[],
  message: string,
): Promise<{ commitSha: string; branchName: string; changedFiles: string[] }> {
  if (!/^forgeoptimizer\/run-[a-z0-9-]{4,80}$/.test(branchName))
    throw new Error("Optimization commits require a constrained branch");
  if (!files.length)
    throw new Error("At least one optimization file is required");
  const unique = [...new Map(files.map((file) => [file.path, file])).values()];
  for (const file of unique) {
    if (
      !file.path ||
      file.path.startsWith("/") ||
      file.path.split("/").includes("..") ||
      file.path.startsWith(".git/")
    )
      throw new Error(`Unsafe optimization file path: ${file.path}`);
    if (typeof file.content !== "string" || file.content.length > 1_000_000)
      throw new Error(
        `Optimization file is invalid or too large: ${file.path}`,
      );
  }
  const { owner, name } = repositoryPath(repositoryUrl);
  const ref = await githubRequest<{ object: { sha: string } }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/ref/heads/${encodeURIComponent(branchName)}`,
  );
  const commit = await githubRequest<{ tree: { sha: string } }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/commits/${encodeURIComponent(ref.object.sha)}`,
  );
  const tree = await githubRequest<{ sha: string }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/trees`,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: unique.map((file) => ({
          path: file.path,
          mode: "100644",
          type: "blob",
          content: file.content,
        })),
      }),
    },
  );
  const next = await githubRequest<{ sha: string }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message: message.trim() || "optimize: apply reviewed changes",
        tree: tree.sha,
        parents: [ref.object.sha],
      }),
    },
  );
  await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/refs/heads/${encodeURIComponent(branchName)}`,
    { method: "PATCH", body: JSON.stringify({ sha: next.sha, force: false }) },
  );
  return {
    commitSha: next.sha,
    branchName,
    changedFiles: unique.map((file) => file.path),
  };
}

export async function createPullRequest(
  repositoryUrl: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<GitHubPullRequest> {
  const { owner, name } = repositoryPath(repositoryUrl);
  const result = await githubRequest<{
    number: number;
    html_url: string;
    head: { ref: string };
    base: { ref: string };
  }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls`, {
    method: "POST",
    body: JSON.stringify({ head, base, title, body }),
  });
  return {
    number: result.number,
    url: result.html_url,
    head: result.head.ref,
    base: result.base.ref,
    title,
  };
}
