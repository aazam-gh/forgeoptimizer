export type PatchValidation = {
  valid: boolean;
  changedFiles: string[];
  errors: string[];
};

export function validateCandidatePatch(
  diff: string,
  maxFiles = 15,
): PatchValidation {
  const errors: string[] = [];
  if (!diff.trim())
    return {
      valid: false,
      changedFiles: [],
      errors: ["patch must not be empty"],
    };
  if (diff.includes("GIT binary patch"))
    errors.push("binary patches are not supported");
  const changedFiles = [
    ...diff.matchAll(/^(?:\+\+\+ b\/([^\n]+)|--- a\/([^\n]+))$/gm),
  ].map((match) => (match[1] ?? match[2]).trim());
  const uniqueFiles = [...new Set(changedFiles)];
  if (uniqueFiles.length === 0)
    errors.push("patch must identify at least one changed file");
  if (uniqueFiles.length > maxFiles)
    errors.push(
      `patch changes ${uniqueFiles.length} files; maximum is ${maxFiles}`,
    );
  for (const file of uniqueFiles) {
    if (
      file.startsWith("/") ||
      file.split("/").includes("..") ||
      file.startsWith(".git/")
    )
      errors.push(`unsafe changed file path: ${file}`);
  }
  return { valid: errors.length === 0, changedFiles: uniqueFiles, errors };
}
