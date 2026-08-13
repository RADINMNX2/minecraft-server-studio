param(
  [Parameter(Mandatory=$true)][string]$RepoUrl,
  [string]$Tag = "v1.0.0"
)
$ErrorActionPreference = "Stop"
Write-Output ">>> Adding remote origin -> $RepoUrl"
git remote remove origin -ErrorAction SilentlyContinue
git remote add origin $RepoUrl
Write-Output ">>> Pushing main branch"
git branch -M main
git push -u origin main
Write-Output ">>> Creating tag $Tag and pushing"
git tag $Tag
git push origin $Tag
Write-Output ">>> Done. Workflow 'Build Windows EXE' will now compile and publish the .exe on GitHub."
Write-Output "    Watch it at: $RepoUrl/actions  and the release at: $RepoUrl/releases"
