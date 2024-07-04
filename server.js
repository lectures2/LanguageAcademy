const express = require('express');
const session = require('express-session');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Set the destination directory for uploaded files

// Set up body-parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Set up express-session middleware
app.use(session({
  secret: 'your_secret_key', // Replace 'your_secret_key' with a random secret key
  resave: false,
  saveUninitialized: true
}));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Create a public/uploads folder if it doesn't exist
const fs = require('fs');
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Create a SQLite database connection
const db = new sqlite3.Database('database.db', (err) => {
  if (err) {
    console.error('Error connecting to the database: ', err);
    return;
  }
  console.log('Connected to the database.');
});

// Create a users table if not exists
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  age INTEGER,
  profilePic TEXT
)`, (err) => {
  if (err) {
    console.error('Error creating users table: ', err);
  } else {
    console.log('Users table created successfully.');
  }
});

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Apply route to create a user account
app.post('/apply', (req, res) => {
  const { username, email, password } = req.body;
  const query = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;
  db.run(query, [username, email, password], (err) => {
    if (err) {
      console.error('Error creating user account: ', err);
      res.status(500).send('Error creating user account.');
      return;
    }
    console.log('User account created successfully.');
    res.redirect('/login.html');
  });
});

// Login route
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = `SELECT * FROM users WHERE username = ?`;
  db.get(query, [username], (err, row) => {
    if (err) {
      console.error('Error performing login: ', err);
      res.status(500).send('Error performing login.');
      return;
    }
    if (!row) {
      res.status(401).send('Invalid username or password.');
      return;
    }
    if (row.password !== password) {
      res.status(401).send('Invalid username or password.');
      return;
    }

    // Store the username in the session
    req.session.username = username;

    res.sendStatus(200);
  });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  if (!req.session.username) {
    // Redirect to login if not logged in
    res.redirect('/login.html');
    return;
  }

  // Pass the username to the dashboard page
  const username = req.session.username;
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Profile route
app.get('/profile', (req, res) => {
  if (!req.session.username) {
    // Redirect to login if not logged in
    res.redirect('/login.html');
    return;
  }

  const username = req.session.username;
  const query = `SELECT * FROM users WHERE username = ?`;
  db.get(query, [username], (err, row) => {
    if (err) {
      console.error('Error fetching user profile: ', err);
      res.status(500).send('Error fetching user profile.');
      return;
    }

    if (!row) {
      res.status(404).send('User not found.');
      return;
    }

    // Pass user data to the profile page
    res.json(row);
  });
});

// Profile update route
app.post('/update-profile', upload.single('profilePic'), (req, res) => {
  const { age, email } = req.body;
  const username = req.session.username;

  // Update the age and email in the database
  const updateQuery = `UPDATE users SET age = ?, email = ? WHERE username = ?`;
  db.run(updateQuery, [age, email, username], (err) => {
    if (err) {
      console.error('Error updating profile: ', err);
      res.status(500).send('Error updating profile.');
      return;
    }

    // If the user uploaded a profile picture, save the file path in the database
    if (req.file) {
      const profilePicPath = '/uploads/' + req.file.filename;
      const updateProfilePicQuery = `UPDATE users SET profilePic = ? WHERE username = ?`;
      db.run(updateProfilePicQuery, [profilePicPath, username], (err) => {
        if (err) {
          console.error('Error updating profile picture: ', err);
          res.status(500).send('Error updating profile picture.');
          return;
        }
        console.log(`Profile picture uploaded: ${req.file.filename}`);

        // Move the uploaded file to a permanent location
        const sourcePath = path.join(__dirname, req.file.path);
        const destinationPath = path.join(__dirname, 'public', 'uploads', req.file.filename);
        fs.rename(sourcePath, destinationPath, (moveErr) => {
          if (moveErr) {
            console.error('Error moving the profile picture: ', moveErr);
            res.status(500).send('Error moving the profile picture.');
            return;
          }

          // Send the response back to the client
          res.sendStatus(200);
        });
      });
    } else {
      res.sendStatus(200);
    }
  });
});

// Settings route
app.get('/settings', (req, res) => {
  if (!req.session.username) {
    // Redirect to login if not logged in
    res.redirect('/login.html');
    return;
  }
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// Logout route
app.get('/logout', (req, res) => {
  // Clear the session
  req.session.destroy((err) => {
    if (err) {
      console.error('Error clearing session: ', err);
    }
    // Redirect to login after logout
    res.redirect('/login');
  });
});

// Get the username from the session and send it back to the client
app.get('/get-username', (req, res) => {
  const username = req.session.username;
  if (!username) {
    res.status(401).send('Not logged in.');
    return;
  }
  res.send(username);
});

// Change password route
app.post('/change-password', (req, res) => {
  if (!req.session.username) {
    // Redirect to login if not logged in
    res.redirect('/login.html');
    return;
  }

  const { newPassword } = req.body;
  const username = req.session.username;

  // Update the password in the database
  const updateQuery = `UPDATE users SET password = ? WHERE username = ?`;
  db.run(updateQuery, [newPassword, username], (err) => {
    if (err) {
      console.error('Error changing password: ', err);
      res.status(500).send('Error changing password.');
      return;
    }

    console.log('Password changed successfully!');
    res.sendStatus(200);
  });
});

// ... (other routes)

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
