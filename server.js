const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 8000;

// Use EJS for server-rendered pages
app.set("views", path.join(__dirname, "templates"));
app.set("view engine", "ejs");

app.use(express.json());
// signed cookies for simple session-style authentication
app.use(cookieParser(process.env.COOKIE_SECRET || "dev-secret"));

// Middleware to serve .html files for extensionless URLs (keep for static fallback)
app.use((req, res, next) => {
  if (!req.path.includes(".") && req.path !== "/") {
    req.url += ".html";
  }
  next();
});

// Serve static files from workspace root
app.use(express.static(path.join(__dirname)));

// Mount users route
const usersRouter = require("./routes/users");
app.use("/users", usersRouter);
const apiUsersRouter = require("./routes/api-users");
app.use("/api", apiUsersRouter);
const authRouter = require("./routes/auth");
app.use("/auth", authRouter);

app.listen(port, () => {
  console.log(`Birthday App server running at http://localhost:${port}`);
});
