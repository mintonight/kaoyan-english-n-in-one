#!/usr/bin/env bash
set -e
REPO="kaoyan-english-n-in-one"
USER="mintonight"
[ -z "$GH_TOKEN" ] && { echo "Set GH_TOKEN (repo+gist scopes)"; exit 1; }
git init -b main
git add .
git commit -m "feat: kaoyan-english n in one initial release" || true
curl -s -X POST https://api.github.com/user/repos \
  -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"name\":\"$REPO\",\"description\":\"一体式考研英语阅读研习系统\",\"private\":false}" || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USER/$REPO.git"
git -c http.extraHeader="Authorization: Bearer $GH_TOKEN" push -u origin main
echo "Done. Enable GitHub Pages: Settings -> Pages -> Source: main / (root)"
