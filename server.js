const path = require("path");
const fs = require('fs');
const express = require("express");
const sql = require("mssql");
const cors = require("cors"); // Allow frontend requests
const multer = require("multer"); // Import multer for file uploads
const app = express();

app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // pang realtime post ng picture

app.use(express.json()); // Parse JSON body
app.use(cors()); // Allow cross-origin requests
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "users")));
app.use(express.static(path.join(__dirname, "admin")));

// ✅ Check if the file is accessible via route
app.get("/userhome", (req, res) => {
    res.sendFile(path.join(__dirname, "users", "userhome.html"));
});

// Database Configuration
const config = {
    user: "skadmin",
    password: "skadmin123",
    server: "DESKTOP-RPKBMV9\\SQLEXPRESS",
    database: "SKMaduyAssist",
    options: { encrypt: false, enableArithAbort: true }
};

// ✅ Register Endpoint
app.post("/register", async (req, res) => {
    console.log("📩 Received Data:", req.body); // Log form data

    const { fullname, email, address, password } = req.body;

    if (!fullname || !email || !address || !password) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        await sql.connect(config);

        const query = `
            INSERT INTO Users (FullName, Email, Address, Password)
            VALUES (@fullname, @email, @address, @password)
        `;

        const request = new sql.Request();
        request.input("fullname", sql.NVarChar, fullname);
        request.input("email", sql.NVarChar, email);
        request.input("address", sql.NVarChar, address);
        request.input("password", sql.NVarChar, password);

        await request.query(query);
        res.json({ message: "✅ User registered successfully!" });
    } catch (err) {
        console.error("❌ SQL Insert Error:", err); // Log SQL error
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

// ✅ Login Endpoint (FIXED: Replaces `db.query()`)
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    try {
        await sql.connect(config);
        const request = new sql.Request();
        request.input("email", sql.NVarChar, email);
        request.input("password", sql.NVarChar, password);

        const result = await request.query("SELECT * FROM Users WHERE Email = @email AND Password = @password");

        if (result.recordset.length > 0) {
            res.json({ success: true, message: "✅ Login successful!" });
        } else {
            res.status(401).json({ message: "❌ Invalid email or password" });
        }
    } catch (err) {
        console.error("❌ SQL Query Error:", err);
        res.status(500).json({ message: "Internal server error", details: err.message });
    }
});

// User Profile Endpoint
app.get("/profile/:email", async (req, res) => {
    const email = req.params.email;

    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input("email", sql.NVarChar, email)
            .query("SELECT FullName, Email, Address, Phone FROM Users WHERE Email = @email");

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json(result.recordset[0]); // Send user data
    } catch (err) {
        console.error("Error fetching profile data:", err);
        res.status(500).json({ error: "Failed to fetch profile data" });
    }
});

// Update Profile Endpoint
app.post("/update-profile", async (req, res) => {
    const { email, address, phone, currentPassword, newPassword, confirmPassword } = req.body;

    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input("email", sql.NVarChar, email)
            .query("SELECT * FROM Users WHERE Email = @email");

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        let passwordUpdateQuery = "";
        let queryParams = [address, phone, email];

        if (newPassword && newPassword === confirmPassword) {
            passwordUpdateQuery = ", Password = @newPassword";
            queryParams.unshift(newPassword);
        } else if (newPassword && newPassword !== confirmPassword) {
            return res.status(400).json({ error: "New passwords do not match" });
        }

        const updateQuery = `
            UPDATE Users
            SET Address = @address, Phone = @phone${passwordUpdateQuery}
            WHERE Email = @email
        `;
        await pool.request()
            .input("address", sql.NVarChar, address)
            .input("phone", sql.NVarChar, phone)
            .input("newPassword", sql.NVarChar, newPassword)
            .query(updateQuery);

        res.json({ success: true, message: "Profile updated successfully" });
    } catch (err) {
        console.error("Error updating profile:", err);
        res.status(500).json({ error: "Failed to update profile" });
    }
});

// ✅ File Upload Configuration (multer)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads'); // Specify upload directory
      },
      filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Generate unique filename
      }
});
const upload = multer({ storage:storage });

// Upload Profile Picture
app.post("/upload-profile-pic", upload.single("profile-picture"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    res.json({ success: true, filePath: `/uploads/${req.file.filename}` });
});

// Submit Scholarship Application
app.post("/submit-application", async (req, res) => {
    const { email, fullName, dob, phone, address, program, scholarshipType, motivation, documents } = req.body;
  
    // Check if the user has already applied using their email (or other unique identifier)
    const existingApplication = await pool.request()
      .input('Email', sql.NVarChar, email)
      .query("SELECT * FROM ScholarshipApplications WHERE Email = @Email");
  
    if (existingApplication.recordset.length > 0) {
      return res.json({
        success: false,
        message: "You have already submitted an application. Please wait for the review process."
      });
    }
  
    // If no previous application, proceed to insert the new application
    try {
      await pool.request()
        .input('FullName', sql.NVarChar, fullName)
        .input('Email', sql.NVarChar, email)
        .input('DOB', sql.Date, dob)
        .input('PhoneNumber', sql.NVarChar, phone)
        .input('Address', sql.NVarChar, address)
        .input('Program', sql.NVarChar, program)
        .input('ScholarshipType', sql.NVarChar, scholarshipType)
        .input('Motivation', sql.Text, motivation)
        .input('Documents', sql.NVarChar, documents)
        .query(`
          INSERT INTO ScholarshipApplications
          (FullName, Email, DOB, PhoneNumber, Address, Program, ScholarshipType, Motivation, Documents)
          VALUES
          (@FullName, @Email, @DOB, @PhoneNumber, @Address, @Program, @ScholarshipType, @Motivation, @Documents)
        `);
  
      res.json({
        success: true,
        message: "✅ Application submitted successfully!"
      });
    } catch (err) {
      console.error("❌ Error:", err);
      res.status(500).json({
        success: false,
        message: "❌ An error occurred while processing your application. Please try again."
      });
    }
  });

  app.post('/admin-login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    try {
        await sql.connect(config);
        const request = new sql.Request();
        request.input("email", sql.NVarChar, email);
        request.input("password", sql.NVarChar, password);

        const result = await request.query("SELECT * FROM Admin WHERE Email = @email AND Password = @password");

        if (result.recordset.length > 0) {
            res.json({ success: true, message: "✅ Login successful!" });
        } else {
            res.status(401).json({ message: "❌ Invalid email or password" });
        }
    } catch (err) {
        console.error("❌ SQL Query Error:", err);
        res.status(500).json({ message: "Internal server error", details: err.message });
    }
});

// Endpoint to fetch scholarship applications
app.get('/admin/scholarship-applications', async (req, res) => {
    try {
      await sql.connect(config);
      const result = await sql.query('SELECT FullName, Email, DOB, PhoneNumber, Address, Program, ScholarshipType, Motivation, Documents, SubmittedAt FROM ScholarshipApplications');
      
      // Send the data as JSON response
      res.json(result.recordset);
    } catch (err) {
      console.error("Error fetching scholarship applications:", err);
      res.status(500).json({ message: "Error fetching data", details: err.message });
    }
  });
  
  app.post('/upload-report', upload.single('file'), async (req, res) => {
    const { title, description, quarter } = req.body;

    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const filePath = req.file.path.replace(/\\/g, '/');  // Fix for Windows paths
    const uploadDate = new Date();

    try {
      // Connect to the database
      await sql.connect(config); // Use the correct config object here

      // Insert data into the database
      await sql.query`
        INSERT INTO FinancialReports (Title, Description, Quarter, FilePath, UploadDate)
        VALUES (${title}, ${description}, ${quarter}, ${filePath}, ${uploadDate})
      `;

      // Respond with success
      res.redirect('/financialreportsadmin.html');
    } catch (err) {
      console.error('Database error:', err);  // Log detailed error to the server console
      res.status(500).send('Error uploading report: ' + err.message);
    }
});

  

app.get('/get-reports', async (req, res) => {
  try {
      await sql.connect(config);
      const result = await sql.query`SELECT * FROM FinancialReports ORDER BY UploadDate DESC`;
      res.json(result.recordset);
  } catch (err) {
      console.error('Error fetching reports:', err); // Log the error
      res.status(500).send('Error fetching reports: ' + err.message); // Provide more detailed error message
  }
});

  // Event Posting Endpoint
app.post("/post-event", upload.single("image"), async (req, res) => {
  const { title, date, location, category, description } = req.body;

  if (!req.file) {
      return res.status(400).send("Image upload failed.");
  }

  const imagePath = `/uploads/${req.file.filename}`; // Relative path to display in frontend

  try {
      await sql.connect(config);
      await sql.query`
          INSERT INTO Events (Title, Date, Location, Category, Description, ImagePath)
          VALUES (${title}, ${date}, ${location}, ${category}, ${description}, ${imagePath})
      `;
      res.redirect("/eventmanagementadmin.html");
  } catch (err) {
      console.error("Event Post Error:", err);
      res.status(500).send("Failed to post event.");
  }
});

app.get("/get-events", async (req, res) => {
  try {
      await sql.connect(config);
      const result = await sql.query("SELECT * FROM Events ORDER BY CreatedAt DESC");
      res.json(result.recordset);
  } catch (err) {
      console.error("Fetch Events Error:", err);
      res.status(500).send("Failed to load events.");
  }
});

app.get('/event-participants/:eventId', async (req, res) => {
  try {
    const eventId = req.params.eventId;  // Get the eventId from the URL params
    
    // Query to get all UserIds from the EventParticipants table for the given eventId
    const participants = await EventParticipant.findAll({
      where: { eventId: eventId },
      include: [{
        model: User, // Assuming you have a User model that corresponds to your Users table
        attributes: ['id', 'name', 'email']  // Get name and email along with UserId
      }]
    });
    
    if (!participants.length) {
      return res.status(404).json({ message: 'No participants found for this event' });
    }

    res.json(participants);  // Return participants with user details
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.delete("/delete-event/:id", async (req, res) => {
  const eventId = req.params.id;

  try {
    await sql.connect(config);
    await sql.query`DELETE FROM Events WHERE Id = ${eventId}`;
    res.sendStatus(200);
  } catch (err) {
    console.error("Delete Event Error:", err);
    res.status(500).send("Failed to delete event.");
  }
});

let posts = [];
// pang community postings admin
app.post("/admin-post", upload.single("image"), async (req, res) => {
  const { title, description } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    await sql.connect(config);
    await sql.query`
      INSERT INTO CommunityPosts (Title, Description, ImagePath)
      VALUES (${title}, ${description}, ${imagePath})
    `;
    res.status(200).send("Post created successfully.");
  } catch (err) {
    console.error("Post Error:", err);
    res.status(500).send("Failed to post.");
  }
});



app.post('/create-post', upload.single('image'), (req, res) => {
  const { title, description } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const newPost = {
    Id: posts.length + 1,
    Title: title,
    Description: description,
    ImagePath: imagePath,
    CreatedAt: new Date(),
    Likes: 0,
    Comments: []
  };

  posts.push(newPost);
  res.status(200).json({ message: 'Post created!' });
});


app.get('/posts', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM CommunityPosts ORDER BY CreatedAt DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Failed to fetch posts.' });
  }
});

app.post('/like-post/:id', (req, res) => {
  const post = posts.find(p => p.Id == req.params.id);
  if (post) {
    post.Likes++;
    res.status(200).json({ message: 'Liked!' });
  } else {
    res.status(404).json({ message: 'Post not found' });
  }
});

app.post('/comment-post/:id', (req, res) => {
  const post = posts.find(p => p.Id == req.params.id);
  if (post) {
    const { comment } = req.body;
    post.Comments.push(comment);
    res.status(200).json({ message: 'Comment added!' });
  } else {
    res.status(404).json({ message: 'Post not found' });
  }
});


//pang dashboard
app.get('/admin-dashboard-stats', async (req, res) => {
  try {
    const [users] = await pool.query('SELECT COUNT(*) as count FROM Users');
    const [posts] = await pool.query('SELECT COUNT(*) as count FROM CommunityPosts');
    const [scholars] = await pool.query('SELECT COUNT(*) as count FROM ScholarshipApplications');
    const [events] = await pool.query('SELECT COUNT(*) as count FROM Events');

    res.json({
      users: users[0].count,
      posts: posts[0].count,
      scholars: scholars[0].count,
      events: events[0].count
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Start Server
const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
