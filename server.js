// Import required modules
var express = require("express");
var app = express();
var formidable = require("express-formidable");
app.use(formidable());
var mongodb = require("mongodb");
var mongoClient = mongodb.MongoClient;
var ObjectId = mongodb.ObjectId;
var httpObj = require("http");
var http = httpObj.createServer(app);
var bcrypt = require("bcrypt");
var fileSystem = require("fs");
var session = require("express-session");
var MongoStore = require("connect-mongo");

// Use MongoDB connection string from environment variables
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const PORT = process.env.PORT || 3000;

// Session middleware with connect-mongo
app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGO_URI,
    }),
  })
);

// Define publicly accessible folders
app.use("/public/css", express.static(__dirname + "/public/css"));
app.use("/public/js", express.static(__dirname + "/public/js"));
app.use("/public/img", express.static(__dirname + "/public/img"));
app.use("/public/font-awesome-4.7.0", express.static(__dirname + "/public/font-awesome-4.7.0"));
app.use("/public/fonts", express.static(__dirname + "/public/fonts"));

// Use EJS as templating engine
app.set("view engine", "ejs");

// Define main URL (for local development or deployment)
var mainURL = process.env.MAIN_URL || `http://localhost:${PORT}`;

// Global database object
var database = null;

// Middleware to attach main URL and session info
app.use(function (request, result, next) {
  request.mainURL = mainURL;
  request.isLogin = typeof request.session.user !== "undefined";
  request.user = request.session.user;
  next();
});

// Utility functions for file management
function recursiveGetFile(files, _id) {
  for (let file of files) {
    if (file.type !== "folder" && file._id === _id) {
      return file;
    }
    if (file.type === "folder" && file.files.length > 0) {
      const foundFile = recursiveGetFile(file.files, _id);
      if (foundFile) return foundFile;
    }
  }
  return null;
}

function getUpdatedArray(arr, _id, uploadedObj) {
  for (let item of arr) {
    if (item.type === "folder" && item._id === _id) {
      item.files.push(uploadedObj);
    }
    if (item.type === "folder" && item.files.length > 0) {
      getUpdatedArray(item.files, _id, uploadedObj);
    }
  }
  return arr;
}

function removeFileReturnUpdated(arr, _id) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].type !== "folder" && arr[i]._id === _id) {
      try {
        fileSystem.unlinkSync(arr[i].filePath);
      } catch (error) {
        console.error("Error deleting file:", error);
      }
      arr.splice(i, 1);
      return arr;
    }
    if (arr[i].type === "folder" && arr[i].files.length > 0) {
      arr[i].files = removeFileReturnUpdated(arr[i].files, _id);
    }
  }
  return arr;
}

// Start the HTTP server
http.listen(PORT, function () {
  console.log(`Server started at ${mainURL}`);

  // Connect to MongoDB
  mongoClient.connect(MONGO_URI, { useUnifiedTopology: true }, function (error, client) {
    if (error) {
      console.error("Error connecting to MongoDB:", error);
      return;
    }
    database = client.db("file_transfer");
    console.log("Connected to MongoDB");

    // Define routes
    app.get("/", function (request, result) {
      result.render("index", { request });
    });

    app.get("/Login", function (request, result) {
      result.render("Login", { request });
    });

    app.post("/Login", async function (request, result) {
      const { email, password } = request.fields;
      const user = await database.collection("users").findOne({ email });

      if (!user) {
        request.status = "error";
        request.message = "Email does not exist.";
        return result.render("Login", { request });
      }

      bcrypt.compare(password, user.password, function (error, isVerified) {
        if (isVerified) {
          request.session.user = user;
          return result.redirect("/");
        }
        request.status = "error";
        request.message = "Invalid password.";
        result.render("Login", { request });
      });
    });

    app.get("/Register", function (request, result) {
      result.render("Register", { request });
    });

    app.post("/Register", async function (request, result) {
      const { name, email, password } = request.fields;
      const existingUser = await database.collection("users").findOne({ email });

      if (existingUser) {
        request.status = "error";
        request.message = "Email already exists.";
        return result.render("Register", { request });
      }

      bcrypt.hash(password, 10, async function (error, hash) {
        await database.collection("users").insertOne({
          name,
          email,
          password: hash,
          uploaded: [],
          sharedWithMe: [],
        });
        request.status = "success";
        request.message = "Registered successfully.";
        result.render("Register", { request });
      });
    });

    app.get("/Logout", function (request, result) {
      request.session.destroy();
      result.redirect("/");
    });

    // Add additional routes as needed, such as upload, delete, share, etc.
  });
});
