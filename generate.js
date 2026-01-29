import fs from "fs-extra";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const GA_ID = "G-XXXXXXXXXX";
const CONTENT_DIR = path.join(process.cwd(), "content");
const OUTPUT_DIR = path.join(process.cwd(), "dist");
const CSS_FILE_NAME = "globals.css";
const CSS_SOURCE_PATH = path.join(process.cwd(), "public", CSS_FILE_NAME);
const IMAGES_SOURCE_PATH = path.join(process.cwd(), "public", "images");
const ARTICLES_PER_PAGE = 10;

const GA_SNIPPET = `
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');
</script>
`;

async function getMarkdownFiles(dir) {
  const results = [];
  for (const entry of await fs.readdir(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) results.push(...(await getMarkdownFiles(fullPath)));
    else if (entry.endsWith(".md")) results.push(fullPath);
  }
  return results;
}

function getRelativeAssetPath(outputPath, assetPath) {
  return path.relative(path.dirname(outputPath), path.join(OUTPUT_DIR, assetPath)).replace(/\\/g, "/");
}

async function convertMarkdownToHTML(filePath, outputPath, frontMatter) {
  const raw = await fs.readFile(filePath, "utf-8");
  const { content } = matter(raw);

  const renderer = {
    heading(text, level) {
      if (level === 2) return `</section><section><h2>${text}</h2>`;
      return `<h${level}>${text}</h${level}>`;
    },
  };
  marked.use({ renderer });

  const fixedContent = fixMarkdownImagePaths(content);
  const htmlContent = `<section>${marked(fixedContent)}</section>`;
  const title = frontMatter.title || "Untitled";
  const description = frontMatter.description || "";
  const imagePath = frontMatter.featured_image
    ? getRelativeAssetPath(outputPath, frontMatter.featured_image)
    : "";
  const cssRelativePath = getRelativeAssetPath(outputPath, CSS_FILE_NAME);
  const url = frontMatter.url || "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">

<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
${imagePath ? `<meta property="og:image" content="${imagePath}">` : ""}
${url ? `<meta property="og:url" content="${url}">` : ""}

<meta name="twitter:card" content="${imagePath ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
${imagePath ? `<meta name="twitter:image" content="${imagePath}">` : ""}

<link rel="stylesheet" href="${cssRelativePath}">
${GA_SNIPPET}
</head>
<body>
<main>
<article>
<header><h1>${title}</h1></header>
${htmlContent}
<footer>
${frontMatter.author ? `<p>Author: ${frontMatter.author}</p>` : ""}
${frontMatter.date ? `<p>Date: <time datetime="${frontMatter.date}">${new Date(frontMatter.date).toLocaleDateString()}</time></p>` : ""}
</footer>
</article>
</main>
</body>
</html>`;
}

function fixMarkdownImagePaths(markdownContent) {
  // Replace any ![alt](...public/images/...) → ../../images/...
  return markdownContent.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    if (src.includes("public/images")) {
      const newPath = src.split("public/images")[1]; // get the path after public/images
      return `![${alt}](../../images${newPath})`;
    }
    return match;
  });
}


function generateIndexPageHtml(articles, currentPage, totalPages) {
  const articleList = articles
    .map(a => `<li><a href="${a.url}">${a.title}</a> <small>${new Date(a.date).toLocaleDateString()}</small></li>`)
    .join("\n");

  let pagination = "";
  if (totalPages > 1) {
    pagination = "<nav><ul class='pagination'>";
    for (let i = 1; i <= totalPages; i++) {
      pagination += `<li${i === currentPage ? " class='current'" : ""}><a href="${i === 1 ? "index.html" : `page${i}.html`}">${i}</a></li>`;
    }
    pagination += "</ul></nav>";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Articles - Page ${currentPage}</title>
<link rel="stylesheet" href="${CSS_FILE_NAME}">
${GA_SNIPPET}
</head>
<body>
<main>
<h1>All Articles</h1>
<ul>
${articleList}
</ul>
${pagination}
</main>
</body>
</html>`;
}

async function generate() {
  try {
    await fs.emptyDir(OUTPUT_DIR);
    await fs.copy(CSS_SOURCE_PATH, path.join(OUTPUT_DIR, CSS_FILE_NAME));
    await fs.copy(IMAGES_SOURCE_PATH, path.join(OUTPUT_DIR, "images"));

    const mdFiles = await getMarkdownFiles(CONTENT_DIR);
    const allArticles = [];

    for (const file of mdFiles) {
      const relativePath = path.relative(CONTENT_DIR, file).replace(/\.md$/, ".html");
      const outputPath = path.join(OUTPUT_DIR, relativePath);

      const raw = await fs.readFile(file, "utf-8");
      const { data: frontMatter } = matter(raw);

      allArticles.push({
        title: frontMatter.title || "Untitled",
        date: frontMatter.date || (await fs.stat(file)).birthtime.toISOString(),
        url: relativePath.replace(/\\/g, "/"),
      });

      const html = await convertMarkdownToHTML(file, outputPath, frontMatter);
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeFile(outputPath, html, "utf-8");
    }

    allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalPages = Math.ceil(allArticles.length / ARTICLES_PER_PAGE);

    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * ARTICLES_PER_PAGE;
      const end = start + ARTICLES_PER_PAGE;
      const articlesOnPage = allArticles.slice(start, end);
      const pageHtml = generateIndexPageHtml(articlesOnPage, page, totalPages);
      const pagePath = page === 1
        ? path.join(OUTPUT_DIR, "index.html")
        : path.join(OUTPUT_DIR, `page${page}.html`);
      await fs.writeFile(pagePath, pageHtml, "utf-8");
    }

    console.log("✅ Site generation complete!");
  } catch (err) {
    console.error("❌ Error generating site:", err);
  }
}

generate();
