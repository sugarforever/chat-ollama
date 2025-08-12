/**
 * Utility functions for rendering different artifact types to HTML
 */

export function renderHTML(html: string): string {
  // Wrap HTML in a complete document structure if it's not already
  if (!html.includes('<html>') && !html.includes('<!DOCTYPE')) {
    const wrappedHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artifact</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`
    return wrappedHTML
  }
  return html
}

export function renderJavaScript(js: string): string {
  // Wrap JavaScript in an HTML document with script tag
  const jsHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JavaScript App</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    ${js}
  </script>
</body>
</html>`
  return jsHTML
}

export function renderCSS(css: string): string {
  // Create a demo HTML with the CSS applied
  const cssHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CSS Demo</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }
    ${css}
  </style>
</head>
<body>
  <div class="demo-container">
    <h1>CSS Demo</h1>
    <p>This is a preview of your CSS styles.</p>
    <div class="example-content">
      <button>Button</button>
      <input type="text" placeholder="Input field">
      <div class="card">Card element</div>
    </div>
  </div>
</body>
</html>`
  return cssHTML
}