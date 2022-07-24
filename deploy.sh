#!/usr/bin/env sh

# 确保脚本抛出遇到的错误
set -e

# 生成静态文件
npm run docs:build

# 进入生成的文件夹
cd docs/.vuepress/dist

# 如果是发布到自定义域名
# echo 'www.example.com' > CNAME

if [ ! -d .git ]; then
   echo ".git isn't exist"
   git init
fi
git add -A
git commit -m "$1"

# 如果发布到 https://<USERNAME>.github.io
git push -f https://github.com/stone-98/stone-98.github.io.git master

# 如果发布到 https://<USERNAME>.github.io/<REPO>
# git push -f git@github.com:<USERNAME>/<REPO>.git master:gh-pages

cd -