"use client";

const IGNORED_PATHS = [
  'node_modules', 'vendor', '.git', 'dist', 'build', 'out', 'bin', 'obj',
  '.next', '.nuxt', 'coverage', '.cache', 'public/assets'
];

const IGNORED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.mp4', '.exe', '.dll', '.so', '.dylib', 
  '.zip', '.tar', '.gz', '.pdf', '.lock', '.svg', '.ico'
];

// Focus specifically on files that give architectural & security context
const PRIORITY_FILES = [
  // Dependency manifests
  /^package\.json$/, /^pom\.xml$/, /^requirements\.txt$/, /^go\.mod$/, /^Cargo\.toml$/,
  // IaC/config
  /^Dockerfile/, /^docker-compose/, /.*\.tf$/, /helm/i, /kubernetes/i, /k8s/i, /.*\.ya?ml$/,
  // API definitions
  /swagger/i, /openapi/i, /graphql/i, /.*\.proto$/,
  // Auth/security
  /auth/i, /jwt/i, /middleware/i, /permission/i, /rbac/i, /oauth/i,
  // Routing
  /routes/i, /controllers/i, /api/i, /handlers/i,
  // Data models
  /models/i, /entities/i, /migrations/i,
  // CI/CD
  /\.github\/workflows/i, /\.gitlab-ci\.yml$/, /Jenkinsfile/i,
  // README
  /^README\.md$/
];

export const parseGitHubUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'github.com') {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return { owner: parts[0], repo: parts[1].replace('.git', '') };
    }
  } catch (e) {
    // Invalid URL
  }
  return null;
};

export const scanGitHubRepository = async (owner: string, repo: string): Promise<string> => {
  try {
    // 1. Fetch Metadata
    const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (!metaRes.ok) {
      if (metaRes.status === 403) throw new Error("GitHub API rate limit exceeded.");
      throw new Error("Repository not found or private.");
    }
    const meta = await metaRes.json();
    const defaultBranch = meta.default_branch;

    // 2. Fetch File Tree (Recursive)
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);
    if (!treeRes.ok) throw new Error("Failed to fetch repository tree.");
    const treeData = await treeRes.json();

    // 3. Filter Tree and Identify Priority Files
    const paths: string[] = [];
    const priorityPaths: string[] = [];

    for (const item of treeData.tree) {
      if (item.type !== 'blob') continue;
      
      const path = item.path;
      
      // Skip ignored paths & extensions
      if (IGNORED_PATHS.some(ignore => path.includes(`${ignore}/`) || path.startsWith(`${ignore}/`))) continue;
      if (IGNORED_EXTENSIONS.some(ext => path.toLowerCase().endsWith(ext))) continue;

      paths.push(path);

      // Check if priority file
      const filename = path.split('/').pop() || '';
      if (PRIORITY_FILES.some(regex => regex.test(filename) || regex.test(path))) {
        priorityPaths.push(path);
      }
    }

    // Limit tree size for the LLM prompt to save tokens
    const treeSample = paths.slice(0, 400);
    const treeStr = treeSample.join('\n') + (paths.length > 400 ? `\n...and ${paths.length - 400} more files` : '');

    // 4. Fetch File Contents (Top 15 priority files to serve as SAST/SCA input)
    const filesToFetch = priorityPaths.slice(0, 15);
    const fileContents: { path: string, content: string }[] = [];

    await Promise.all(filesToFetch.map(async (path) => {
      try {
        // Fetch raw file to bypass standard API rate limits
        const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${path}`);
        if (rawRes.ok) {
          const text = await rawRes.text();
          // Truncate individual files to ~3000 chars to avoid blowing up the context window
          fileContents.push({ 
            path, 
            content: text.length > 3000 ? text.substring(0, 3000) + '\n...[TRUNCATED]' : text 
          });
        }
      } catch (e) {
        console.warn(`Failed to fetch raw file: ${path}`);
      }
    }));

    // 5. Build the final context string for the Agent
    let result = `--- GITHUB REPOSITORY DATA ---\n`;
    result += `Repository: ${owner}/${repo}\n`;
    result += `Description: ${meta.description || 'None'}\n`;
    result += `Primary Language: ${meta.language || 'Unknown'}\n\n`;
    
    result += `--- FILE TREE (Filtered) ---\n${treeStr}\n\n`;

    result += `--- CRITICAL FILE CONTENTS (SAST/SCA Input) ---\n`;
    for (const file of fileContents) {
      result += `\nFile: ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
    }

    return result;

  } catch (error: any) {
    console.warn("GitHub Scan Failed:", error);
    return `Failed to deeply scan repository: ${error.message}. Proceeding with heuristic analysis based on URL only.`;
  }
};