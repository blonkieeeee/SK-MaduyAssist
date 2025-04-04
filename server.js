const path = require("path");
const fs = require('fs');
const express = require("express");
const sql = require("mssql");
const cors = require("cors"); // Allow frontend requests
const multer = require("multer"); // Import multer for file uploads
const app = express();


app.use(express.json()); // Parse JSON body
app.use(cors()); // Allow cross-origin requests
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "users")));

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

// Start Server
const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
