#!/usr/bin/env sh

# 确保脚本抛出遇到的错误
set -e

# 生成静态文件
npm run docs:build

if [ -n "$(git status -s)" ];then
    echo "github-page-generator starting push"
    git add .
    git commit -m "$1"
    git push origin master:master
    echo "github-page-generator push finish"
fi

# 进入生成的文件夹
cd ../../IdeaWorkSpace/stone-98.github.io

# 如果是发布到自定义域名
# echo 'www.example.com' > CNAME

if [ -n "$(git status -s)" ];then
    echo "stone-98.github.io starting push"
    git add .
    git commit -m "$1"
    git push origin master:master
    echo "stone-98.github.io push finish"
fi

# 如果发布到 https://<USERNAME>.github.io/<REPO>
# git push -f git@github.com:<USERNAME>/<REPO>.git master:gh-pages

cd -