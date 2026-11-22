# Deploy to GitHub  (run inside kaoyan-english-n-in-one folder)
# 1) set $env:GH_TOKEN to a token with repo + gist scopes
# 2) run:  pwsh ./deploy.ps1
$ErrorActionPreference = "Stop"
$repo = "kaoyan-english-n-in-one"
$user = "mintonight"
if (-not $env:GH_TOKEN) { Write-Host "Set GH_TOKEN first (repo+gist scopes)"; exit 1 }

git init -b main
git add .
git commit -m "feat: kaoyan-english n in one initial release" 2>$null

$body = @{ name = $repo; description = "一体化考研英语阅读研习系统：真题交互刷题 + 笔记 + Gist 同步"; private = $false } | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post -Uri "https://api.github.com/user/repos" "
    -Headers @{ Authorization = "token $env:GH_TOKEN"; Accept = "application/vnd.github+json" } "
    -Body $body -ContentType "application/json" | Out-Null
  Write-Host "Repo created."
} catch { Write-Host "Repo may already exist, continuing..." }

git remote remove origin 2>$null
git remote add origin "https://github.com/$user/$repo.git"
# push using token via credential header (no token stored in URL)
git -c http.extraHeader="Authorization: Bearer $env:GH_TOKEN" push -u origin main

Write-Host "Done. Enable GitHub Pages: Settings -> Pages -> Source: main / (root)"
