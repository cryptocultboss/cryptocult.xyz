# Build site
node generate.js

# Create worktree for dist branch
git worktree add ../dist-branch dist

# Copy dist output into the worktree root
rm -rf ../dist-branch/*
cp -r dist/* ../dist-branch/

# Commit & push
cd ../dist-branch
git add .
git commit -m "Deploy static site"
git push origin dist --force

# Cleanup
cd -
git worktree remove ../dist-branch
