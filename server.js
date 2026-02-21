const express = require("express");
const path = require("path");
const app = express();
const port = 8000;

// Middleware to serve .html files for extensionless URLs
app.use((req, res, next) => {
  if (!req.path.includes(".") && req.path !== "/") {
    req.url += ".html";
  }
  next();
});

// Serve static files from workspace root
app.use(express.static(path.join(__dirname)));

app.listen(port, () => {
  console.log(`Birthday App server running at http://localhost:${port}`);
});
