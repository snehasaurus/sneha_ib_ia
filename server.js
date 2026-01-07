require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const session = require('express-session');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const { jsPDF } = require('jspdf');
const { createCanvas } = require('canvas');


const app = express();
const saltRounds = 10;

// Middleware
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

app.use(express.static('public'));

// app.use(session({
//     secret: 'your-secret-key', 
//     //A cryptographic string used to sign the session ID cookie 
//      // ensures integrity so clients cannot tamper with their own session ID.

//     resave: false,
//     // Prevents session data from being re-saved to the store if nothing has changed → 
//     // improves performance and reduces unnecessary writes.
    
//     saveUninitialized: true
//     //Forces a new but empty session to be stored even if no data is set → 
//     // ensures that a unique session ID is issued for every visitor, which is later be populated on login.
// }));

// 🔐 Persistent session management using MySQL store
const MySQLStore = require('express-mysql-session')(session);

const sessionStore = new MySQLStore({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_PASSWORD,
  database: 'LoginDB',
  clearExpired: true,
  checkExpirationInterval: 900000, // clear expired every 15 mins
  expiration: 24 * 60 * 60 * 1000  // 1 day session lifespan
});

app.use(session({
  key: 'user_sid',
  secret: 'your-secret-key', // use a long, random key in .env ideally
  store: sessionStore,
  resave: false,
  saveUninitialized: false, // prevents saving empty sessions
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    httpOnly: true, // protects from JS access
    secure: false   // set true only if using HTTPS
  }
}));

app.use((req, res, next) => {
    console.log('Session data:', req.session);
    next();
});

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD,
    database: 'LoginDB' // The database password is stored in a local file called .env as it shouldn't be shared.
});
//The backend communicates with the relational database using the MySQL dependency, which establishes access to the library. 


db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'blissfulbarfi@gmail.com',
        pass: 'txsl fpmv qtjy ziym'
    }
});

// Login + Role Redirection
app.use(express.json());
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const query = 'SELECT * FROM users WHERE username = ?';
  db.query(query, [username], async (err, results) => {
    if (err) return res.status(500).send('Database error.');
    if (results.length === 0) return res.send('Error: User not found.');

    const user = results[0];

    // ✅ Compare entered password with hashed password from DB
    try {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.send('Error: Incorrect password.');
    } catch (bcryptErr) {
      console.error('Password comparison error:', bcryptErr);
      return res.status(500).send('Internal error during authentication.');
    }

    // ✅ Store essential user details in the session
    req.session.user = {
      id: user.id,            // unique user identifier
      username: user.username, // username displayed in dashboard
      role: user.role         // used for role-based access control
    };

    // ✅ Explicitly save the session to ensure persistence before redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Error saving session.');
      }

      console.log('✅ Session saved for:', req.session.user.username);

      // ✅ Redirect user to their respective dashboard
      if (user.role === 'admin') return res.redirect('/admin');
      else if (user.role === 'General Employee') return res.redirect('/employee-dashboard');
      else if (user.role === 'Department Head') return res.redirect('/department-head');
      else return res.send('Login successful, but no dashboard defined for your role.');
    });
  });
});
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  } else {
    return res.status(401).send('Session expired. Please log in again.');
  }
}

// Admin Routes
function ensureAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.send('You must log in to access this page.');
}

app.get('/admin', (req, res) => {  //Checks if a user is logged in and has the role 'admin'
/*
When a request is made to /admin, the server checks if the session exists and if the role is equal to admin. 
Only then is the requested file served; otherwise, access is denied.
*/
    if (req.session.user && req.session.user.role === 'admin') { 
        //check if the user is stored as an admin in the database
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
        //when the if condition passes, the admin dashboard webpage is sent to the user's browser 
      
    } else {
        res.send('Access denied. Admins only.');
        // If condition fails, unauthorised access is denied immediately
    }
    // This route protects sensitive admin dashboard from being accessed by non-admin users


});

// app.get('/admin-dashboard', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
// });

// //  Admin dashboard data route
// app.get('/admin-dashboard-data', (req, res) => {
//   if (req.session.user && req.session.user.role === 'admin') {
//     const departmentsQuery = `
//       SELECT d.department_id, d.department_name, d.requested_budget, d.admin_comments,
//              d.budget_status, u.username AS department_head
//       FROM departments d
//       LEFT JOIN users u ON d.department_head_id = u.id
//     `;

//     const expendituresQuery = `
//       SELECT department_id, SUM(expenditure_amount) AS actual_spent 
//       FROM expenditures 
//       GROUP BY department_id
//     `;

//     db.query(departmentsQuery, (err, departmentsResults) => {
//       if (err) return res.status(500).send('Error fetching departments data.');

//       db.query(expendituresQuery, (err, expendituresResults) => {
//         if (err) return res.status(500).send('Error fetching expenditures data.');

//         res.json({ //the json object contains both departmental data and aggregated expenditures
//           departments: departmentsResults,
//           expenditures: expendituresResults
//         });
//         /*
//         For each of the expenditure records that are retrieved, the details (department_ID, department_name, etc.)
//          are requested from the database. 
//       */});
//     });
//   } else {
//     res.send('Access denied. Admins only.');
//   }
// });

// Route for Admin Dashboard Page
app.get('/admin-dashboard', (req, res) => {
  if (req.session.user && req.session.user.role === 'admin') {
    // Serve the actual dashboard HTML file
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
  } else {
    res.status(403).send('Access denied. Admins only.');
  }
});


app.get('/admin-dashboard-data', (req, res) => {
  /* 
  grouped aggregation -  all expenditures are grouped by their department_id instead of 
                         sending separate requests for each department’s expenditures.

  benefits -  This design reduces the total number of HTTP calls the frontend needs to make, improving performance and responsiveness 
              at runtime.
  drawbacks - it also means that the initial payload is larger, which may increase the initial page load time — sacrificing latency 
              for bandwidth.

  */
  if (req.session.user && req.session.user.role === 'admin') {
    const query = `
      SELECT d.department_id, d.department_name, d.requested_budget, d.admin_comments,
             d.budget_status, u.username AS department_head,
             COALESCE(SUM(e.expenditure_amount), 0) AS actual_spent
      FROM departments d
      LEFT JOIN users u ON d.department_head_id = u.id
      LEFT JOIN expenditures e ON d.department_id = e.department_id
      GROUP BY d.department_id, d.department_name, d.requested_budget, 
               d.admin_comments, d.budget_status, u.username
    `;
    /*department_id is the foreign key in the expenditures table, and is used to sort expenditures by department.
    user_id is the foreign id in the department table, and is used to show which user is the department head for the 
    expenditure-department. hence all relevant data can be displayed.
    */
    db.query(query, (err, results) => {
      if (err) return res.status(500).send('Error fetching dashboard data.');
      res.json(results || []);
    });
  } else {
    res.send('Access denied. Admins only.');
  }
});

// === Update Comment === //
app.post('/update-comment', (req, res) => {
  console.log('/update-comment body:', req.body);
  const { department_id, comment } = req.body;
  if (!department_id || typeof comment !== 'string') {
    return res.status(400).send('Invalid payload');
  }

  const query = 'UPDATE departments SET admin_comments = ? WHERE department_id = ?';
  db.query(query, [comment, department_id], (err, result) => {
    if (err) {
      console.error('DB error on update-comment:', err);
      return res.status(500).send('Error updating comment.');
    }
    if (result.affectedRows === 0) {
      return res.status(404).send('Department not found');
    }

    // Notify department head (still resolve even if email fails)
    notifyDeptHead(department_id)
      .then(() => res.sendStatus(200))
      .catch(e => {
        console.error("Notification error (comment):", e);
        res.sendStatus(200);
      });
  });
});

// Update status route (fixed braces + validation)
app.post('/update-status', (req, res) => {
  console.log('/update-status body:', req.body);
  const { department_id, status } = req.body;

  // validate status is A/D/P
  if (!department_id || !['A','D','P'].includes(status)) {
    return res.status(400).send('Invalid payload or status (must be A, D, or P)');
  }

  const query = 'UPDATE departments SET budget_status = ? WHERE department_id = ?';
  db.query(query, [status, department_id], (err, result) => {
    if (err) {
      console.error('DB error on update-status:', err);
      return res.status(500).send('Error updating status.');
    }
    if (result.affectedRows === 0) {
      return res.status(404).send('Department not found');
    }

    // Notify department head (still succeed even if notification fails)
    notifyDeptHead(department_id)
      .then(() => res.sendStatus(200))
      .catch(e => {
        console.error("Notification error (status):", e);
        res.sendStatus(200);
      });
  });
});


function notifyDeptHead(department_id) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT d.department_name, d.requested_budget, d.budget_status, d.admin_comments,
             u.email, u.username AS dept_head_name
      FROM departments d
      JOIN users u ON d.department_head_id = u.id
      WHERE d.department_id = ?
      LIMIT 1
    `;

    db.query(query, [department_id], (err, results) => {
      if (err) return reject(err);
      if (!results || results.length === 0) return reject(new Error('Department not found'));

      const row = results[0];

      // ✅ Decide email message type
      let messageLine = "Your recent budget request has been reviewed and has been changed.";

      if (row.budget_status) {
        const status = row.budget_status.toLowerCase();
        if (status === "approved") {
          messageLine = "Your recent budget request has been reviewed and has been approved.";
        } else if (status === "denied") {
          messageLine = "Your recent budget request has been reviewed and has not been approved.";
        }
      }

      // ✅ Build email
      const mailOptions = {
        from: 'YOUR_GMAIL@gmail.com',
        to: row.email,
        subject: 'Budget Request Update',
        text: `Hello ${row.dept_head_name},

${messageLine}

Department: ${row.department_name}
Requested Amount: ${row.requested_budget}
Status: ${row.budget_status || '—'}
Comments: ${row.admin_comments || '—'}

Regards, 
Your Budget Tracking System`
      };

      transporter.sendMail(mailOptions, (mailErr, info) => {
        if (mailErr) return reject(mailErr);
        console.log("Email sent:", info.response);
        resolve();
      });
    });
  });
}

// === Update Status === //
app.post('/update-status', (req, res) => {
  const { department_id, status } = req.body;
  const query = 'UPDATE departments SET budget_status = ? WHERE department_id = ?';
  db.query(query, [status, department_id], (err) => {
    if (err) return res.status(500).send('Error updating status.');

    // Notify department head
    notifyDeptHead(department_id)
      .then(() => res.sendStatus(200))
      .catch(e => {
        console.error("Notification error:", e);
        res.sendStatus(200); // still succeed for admin
      });
  });
});


// //testing testing delete after 

// app.get('/test-mail', (req, res) => {
//     transporter.sendMail({
//         from: 'blissfulbarfi@gmail.com',
//         to: 'sneha.u.gautam@gmail.com',
//         subject: 'Test Email',
//         text: 'If you got this, email is working.',
//     }, (error, info) => {
//         if (error) {
//             console.error('Mail error:', error);
//             return res.send('Failed to send test email');
//         }
//         res.send('Test email sent successfully');
//     });
// });

// User Management Routes
app.get('/user-management', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'user-management.html'));
});

app.get('/api/users', (req, res) => {
  if (req.session.user && req.session.user.role === 'admin') {
    const query = `
      SELECT u.id, u.username, u.role, d.department_name 
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.department_id
    `;
    db.query(query, (err, results) => {
      if (err) return res.status(500).send('Error fetching users.');
      res.json(results);
    });
  } else {
    res.status(403).send('Access denied.');
  }
});


app.post('/delete-user', (req, res) => {//this route handles administrator-initiated requests to remove a user from the users table.
    const { id } = req.body;
    const query = 'DELETE FROM users WHERE id = ?'; 
    /* this is hard deletion - the user is removed permanently, meaning historical data associated with that user (e.g., budget submissions)
                              may lose referential context.
     an alternate solution is soft deletion - (e.g., is_active = false), which preserves referential integrity at the cost of 
                                              increased storage
     for this system -  hard deletion was appropriate, as administrators explicitly requested the ability to purge inactive
                        accounts from the system.

    */
    db.query(query, [id], (err) => {
        if (err) return res.status(500).send('Error deleting user.');
        res.sendStatus(200);
    });
});

app.post('/edit-user', (req, res) => {
    const { id, name, department, role } = req.body;
    const query = 'UPDATE users SET name = ?, department = ?, role = ? WHERE id = ?';
    db.query(query, [name, department, role, id], (err, results) => {
        if (err) return res.status(500).send('Error updating user.');
        res.sendStatus(200);
    });
});

app.post('/api/users/add', async (req, res) => {
  const { username, email, password, role, department_name } = req.body;

  if (!username || !email || !password || !role || !department_name) {
    return res.status(400).send('Missing required fields.');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Step 1: Fetch department_id from department_name
    const getDeptQuery = 'SELECT department_id FROM departments WHERE department_name = ? LIMIT 1';
    db.query(getDeptQuery, [department_name], (err, deptResults) => {
      if (err) return res.status(500).send('Database error while fetching department.');
      if (deptResults.length === 0) return res.status(400).send('Invalid department.');

      const department_id = deptResults[0].department_id;

      // Step 2: Insert new user
      const insertQuery = `
        INSERT INTO users (username, email, password, role, department_id)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.query(insertQuery, [username, email, hashedPassword, role, department_id], (insertErr) => {
        if (insertErr) {
          console.error('Error inserting user:', insertErr);
          return res.status(500).send('Error adding user.');
        }

        // Step 3: Send onboarding email
        sendOnboardingEmail(username, email, role, department_name)
          .then(() => {
            console.log(`✅ Onboarding guide sent to ${email}`);
            res.sendStatus(200);
          })
          .catch((e) => {
            console.error('Error sending onboarding email:', e);
            res.sendStatus(200); // Still succeed for the admin
          });
      });
    });
  } catch (error) {
    console.error('Error hashing password:', error);
    res.status(500).send('Server error.');
  }
});



// Other Routes
app.get('/budget-requests', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'budget-requests.html'));
});

app.get('/budget-reports', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'budget-reports.html'));
});

app.get('/employee-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'employee-dashboard.html'));
});

app.get('/manager-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manager-dashboard.html'));
});

// ✅ New 3-Step Password Reset (Email Verification Code)

// Step 1: Request verification code
app.post('/request-reset', (req, res) => {
    const { username } = req.body;
    db.query('SELECT email FROM users WHERE username = ?', [username], (err, results) => {
        if (err || results.length === 0) return res.send('User not found');

        const email = results[0].email;
        const code = Math.floor(10000 + Math.random() * 90000); // 5-digit code

        req.session.resetUsername = username;
        req.session.verificationCode = code;

        const mailOptions = {
            from: 'blissfulbarfi@gmail.com',
            to: email,
            subject: 'Your Password Reset Code',
            text: `Your password reset verification code is: ${code}`
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) return res.send('Error sending email');
            res.redirect('/verify-code.html');
        });
    });
});

// Step 2: Verify the code
app.post('/verify-code', (req, res) => {
    const { code } = req.body;
    if (parseInt(code) === req.session.verificationCode) {
        req.session.codeVerified = true;
        res.redirect('/reset-password.html');
    } else {
        res.send('Invalid verification code.');
    }
});

// Step 3: Reset password
app.post('/reset-password', async (req, res) => {
    const { newPassword, confirmPassword } = req.body;

    if (!req.session.codeVerified || !req.session.resetUsername) {
        return res.send('Session expired or invalid access.');
    }

    if (newPassword !== confirmPassword) {
        return res.send('Passwords do not match.');
    }

    //code for updating the changed password if a user resets their password

    const hashedPassword = await bcrypt.hash(newPassword, saltRounds); 
    //when registering a new administrator, the password entered by the user is first passed through this function 

    /*  'saltRounds' defines the cost factor (number of iterations) → more secure but slower
                    - The saltRounds parameter controls the computational complexity of the hashing process by introducing unique salts 
                      and performing multiple iterations of hashing. 
                    - This makes brute-force or rainbow-table attacks computationally expensive. */
    db.query(
        'UPDATE users SET password = ? WHERE username = ?',
        // SQL UPDATE query to replace the old password with the new hashed password
        //The resulting hash is inserted into the users table, replacing the plaintext value

        [hashedPassword, req.session.resetUsername], // Use parameterized values to prevent SQL injection
        (err) => {
            if (err) return res.send('Error updating password.');
            req.session.destroy(); 
            // Destroy the session after password reset → prevents reuse of old session
            res.send('Password successfully updated.');
             // Send confirmation response to the client
        }
    );
});

//API for Budget Reports (THIS IS WHAT U ADD BACK IF THE CURRENT CODE GOES WRONG)
app.get('/api/budget-reports-data', (req, res) => {
  const query = `
    SELECT d.department_id, d.department_name, d.requested_budget, d.admin_comments, d.budget_status,
           u.username AS department_head
    FROM departments d
    LEFT JOIN users u ON d.department_head_id = u.id
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).send('Database error fetching reports');
    res.json(results);
  });
});






// API for User Management
app.get('/api/users', (req, res) => {
    const sql = `
        SELECT u.id AS id, u.username, u.role, d.department_name
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.department_id
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error('SQL Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Update user details
app.post('/api/users/update', (req, res) => {
    const { id, username, role, department_name } = req.body;
    const getDeptIdSql = 'SELECT department_id FROM departments WHERE department_name = ?';

    db.query(getDeptIdSql, [department_name], (err, deptResult) => {
        if (err || deptResult.length === 0) return res.status(500).json({ error: 'Invalid department name' });

        const department_id = deptResult[0].department_id;
        const updateSql = 'UPDATE users SET username = ?, role = ?, department_id = ? WHERE id = ?';

        db.query(updateSql, [username, role, department_id, id], (err2) => {
            if (err2) return res.status(500).json({ error: 'Failed to update user' });
            res.json({ success: true });
        });
    });
});

// Delete user
app.post('/api/users/delete', (req, res) => {
    const { id } = req.body;
    const deleteSql = 'DELETE FROM users WHERE id = ?';
    db.query(deleteSql, [id], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to delete user' });
        res.json({ success: true });
    });
});





app.post('/email-budget-report', async (req, res) => {
  try {
    const { pdfBase64, department_name } = req.body;

    // Get logged-in user's email from session
    const username = req.session.user?.username;
    if (!username) {
      console.log('No user in session');
      return res.status(401).send('Not logged in.');
    }

    db.query('SELECT email FROM users WHERE username = ?', [username], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('Database error.');
      }

      if (results.length === 0) {
        console.log('No user found');
        return res.status(404).send('User not found.');
      }

      const email = results[0].email;

      // Send email with attached PDF
      transporter.sendMail({
        from: 'blissfulbarfi@gmail.com',
        to: email,
        subject: `Budget Report for ${department_name}`,
        text: 'Attached is your requested budget report.',
        attachments: [{
          filename: `${department_name}_report.pdf`,
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf'
        }]
      }, (emailErr, info) => {
        if (emailErr) {
          console.error('Error sending email:', emailErr);
          return res.status(500).send('Error sending email.');
        }

        console.log('Email sent:', info.response);
        res.send('Email sent successfully!');
      });
    });
  } catch (err) {
    console.error('Unexpected error in /email-budget-report:', err);
    res.status(500).send('Internal server error.');
  }
});

function sendOnboardingEmail(username, email, role, department_name) {
  return new Promise((resolve, reject) => {
    // --- Role descriptions ---
    const roleDescriptions = {
      Admin: `As an Admin, you are responsible for overseeing all departmental budgets, approving requests, and ensuring organizational financial efficiency. You can manage users, track departmental expenditures, and generate comprehensive reports.`,
      'Department Head': `As a Department Head, your role is to plan, monitor, and justify your department’s budget. You can edit spending plans, submit expenditure requests, and communicate with the Admin for approvals.`,
      'General Employee': `As a General Employee, you can view your department’s financial information and track the status of expenditure requests. You play a key role in ensuring transparency and responsible spending within your department.`
    };

    // --- Department descriptions ---
    const departmentDescriptions = {
      HR: `The HR Department focuses on recruitment, employee engagement, and maintaining workplace culture. You’ll oversee or contribute to initiatives related to hiring, training, and staff well-being.`,
      Finance: `The Finance Department is responsible for budget planning, audits, and ensuring optimal resource allocation. You’ll monitor financial transactions and ensure compliance with internal policies.`,
      Marketing: `The Marketing Department manages campaigns, public relations, and brand strategy. You’ll help the organization reach its goals by driving visibility and engagement.`,
      IT: `The IT Department ensures technological stability and data security across the organization. You’ll maintain systems, troubleshoot issues, and implement digital solutions for efficiency.`,
      'Test Department': `The Test Department is a sandbox environment used for testing new workflows and system updates before they go live. You’ll help evaluate functionality and report potential improvements.`
    };

    const roleText = roleDescriptions[role] || 'Your role involves active participation in the organization’s workflow.';
    const deptText = departmentDescriptions[department_name] || 'Your department plays a vital role in the organization’s operations.';

    // --- Construct email ---
    const mailOptions = {
      from: 'YOUR_GMAIL@gmail.com',
      to: email,
      subject: 'Welcome to the Budget Management System!',
      text: `Hello ${username},

Welcome to the Budget Management System! We’re excited to have you on board.

Here’s an overview of your role and department to help you get started:

**Your Role: ${role}**
${roleText}

**Your Department: ${department_name}**
${deptText}

To get started, log in using the credentials provided by your Admin. 
Please remember to update your password once you first log in.

If you have any questions, reach out to your Department Head or Admin.

Best regards,
The Budget Management Team
`
    };

    // --- Send email ---
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) return reject(err);
      console.log('Onboarding email sent:', info.response);
      resolve();
    });
  });
}




app.post('/register-admin', async (req, res) => {
  const { username, password, email } = req.body;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  const sql = 'INSERT INTO users (username, password, role, email) VALUES (?, ?, ?, ?)';
  
  db.query(sql, [username, hashedPassword, 'admin', email], (err) => {
    if (err) return res.status(500).send('Error registering admin.');
    res.send('Admin registered successfully');
  });
});


//Department Head Routes 

app.get('/department-head', (req, res) => {
    if (req.session.user && req.session.user.role === 'Department Head') {
        res.sendFile(path.join(__dirname, 'public', 'department-head.html'));
    } else {
        res.send('Access denied. Department Heads only.');
    }
});

//department head dashboard route

app.get('/department-head-dashboard', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }
  res.sendFile(path.join(__dirname, 'public', 'department-head-dashboard.html'));
});

// Helper to resolve the Department Head's department_id
function getDeptHeadDepartmentId(req, callback) {
  // If you already store department_id in session, prefer that:
  if (req.session.user && req.session.user.department_id) {
    return callback(null, req.session.user.department_id);
  }
  // Fallback: look it up from users table using logged-in user's id
  const q = 'SELECT department_id FROM users WHERE id = ? LIMIT 1';
  db.query(q, [req.session.user.id], (err, rows) => {
    if (err) return callback(err);
    if (!rows || rows.length === 0) return callback(new Error('User not found'));
    callback(null, rows[0].department_id);
  });
}

// ==========================================
// API: Budget Approval Status (one row only)
// ==========================================
// app.get('/api/department-head/budget-status', (req, res) => {
//   if (!req.session.user || req.session.user.role !== 'Department Head') {
//     return res.status(403).send('Access denied. Department Heads only.');
//   }

//   getDeptHeadDepartmentId(req, (err, departmentId) => {
//     if (err) return res.status(500).send('Error resolving department.');

//     const query = `
//       SELECT department_name, department_head, requested_budget, budget_status, admin_comments
//       FROM departments
//       WHERE department_id = ?
//       LIMIT 1
//     `;

//     db.query(query, [departmentId], (qErr, results) => {
//       if (qErr) return res.status(500).send('Error fetching budget status.');
//       // Return as an array (client expects array and forEach's it)
//       res.json(results || []);
//     });
//   });
// });

// =======================================
// API: Employees in this Department only
// =======================================
app.get('/api/department-head/employees', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {//first checks the user's role
    return res.status(403).send('Access denied. Department Heads only.'); 
    // If the logged-in user is not a Department Head, the server returns an HTTP 403 error, denying access to the resource.

  }
  getDeptHeadDepartmentId(req, (err, departmentId) => {  //Retrieve the department_id for this head
    if (err) return res.status(500).send('Error resolving department.');
  /*
  Once resolved, the department_id is then passed into a parameterized SQL query fetching only the employees
   belonging to the same department as the logged-in Department Head
  */
    const query = ` 
      SELECT u.id, u.username, u.role, u.email, d.department_name
      FROM users u
      JOIN departments d ON u.department_id = d.department_id
      WHERE u.department_id = ?
      ORDER BY u.username ASC
    `;// ✅ Query employees only within this department
    /*Once obtained from the database, the results are returned as a JSON object to the frontend, which then renders them 
    in the Department Head’s dashboard.*/

    // Ensures Department Heads cannot query employees outside their department
    // Department ID is derived from the session, not from user input → prevents tampering
    // Department ID is derived from the session, not from user input → prevents tampering

    db.query(query, [departmentId], (qErr, results) => {
      if (qErr) return res.status(500).send('Error fetching employees.');
      res.json(results || []);
    });
  });
});

// ===================================================
// API: Update a user (only within this department)
// ===================================================
app.post('/api/department-head/employees/update', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }

  const { id, username, role, email } = req.body;
  if (!id || !username || !role || !email) {
    return res.status(400).send('Missing required fields.');
  }

  getDeptHeadDepartmentId(req, (err, departmentId) => {
    if (err) return res.status(500).send('Error resolving department.');

    const query = `
      UPDATE users
      SET username = ?, role = ?, email = ?
      WHERE id = ? AND department_id = ?
    `;
    db.query(query, [username, role, email, id, departmentId], (qErr, result) => {
      if (qErr) {
        console.error("❌ Employee update DB error:", qErr);
        return res.status(500).send('Error updating user.');
      }
      console.log("📌 Employee update result:", result);

      if (result.affectedRows === 0) {
        return res.status(403).send('Update denied or user not in your department.');
      }
      res.sendStatus(200);
    });
  });
});


// ==================================================
// API: Delete a user (only within this department)
// ==================================================
app.post('/api/department-head/employees/delete', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }

  const { id } = req.body;
  if (!id) return res.status(400).send('Missing user id.');

  getDeptHeadDepartmentId(req, (err, departmentId) => {
    if (err) return res.status(500).send('Error resolving department.');

    const query = `
      DELETE FROM users
      WHERE id = ? AND department_id = ?
    `;
    db.query(query, [id, departmentId], (qErr, result) => {
      if (qErr) return res.status(500).send('Error deleting user.');
      if (result.affectedRows === 0) {
        return res.status(403).send('Delete denied or user not in your department.');
      }
      res.sendStatus(200);
    });
  });
});

// =======================================
// API: Update budget (Department Head)
// =======================================
// =======================================
// API: Update budget (Department Head)
// =======================================
app.post('/api/department-head/budget/update', (req, res) => {
  console.log("📌 Budget update request received:", req.body, req.session.user);

  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }

  const { requested_budget } = req.body;
  if (!requested_budget || isNaN(requested_budget)) {
    return res.status(400).send('Invalid budget amount.');
  }

  getDeptHeadDepartmentId(req, (err, departmentId) => {
    if (err) return res.status(500).send('Error resolving department.');

    const query = `UPDATE departments SET requested_budget = ? WHERE department_id = ?`;
    db.query(query, [requested_budget, departmentId], (qErr, result) => {
      if (qErr) {
        console.error("❌ Budget update DB error:", qErr);
        return res.status(500).send('Error updating budget.');
      }
      console.log("📌 MySQL update result:", result);  // ✅ correct place

      if (result.affectedRows === 0) {
        return res.status(404).send('Department not found or not allowed.');
      }

      res.sendStatus(200);
    });
  });
});



// ==============================
// Department Expenditures page
// ==============================
app.get('/department-head-expenditures', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }
  res.sendFile(path.join(__dirname, 'public', 'department-head-expenditures.html'));
});

// ==============================
// API: Get expenditures (filtered by department)
// ==============================
app.get('/api/department-head/expenditures', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }

  getDeptHeadDepartmentId(req, (err, departmentId) => {
    if (err) return res.status(500).send('Error resolving department.');

    const query = `
      SELECT expenditure_id, expenditure_name, expenditure_amount, date
      FROM expenditures
      WHERE department_id = ?
      ORDER BY date DESC
    `;

    db.query(query, [departmentId], (qErr, results) => {
      if (qErr) return res.status(500).send('Error fetching expenditures.');
      res.json(results || []);
    });
  });
});

// ==============================
// API: Add expenditure
// ==============================


// Configure transporter (use your Gmail + App Password here)


// ==============================
// API: Add expenditure + Notify Admins
// ==============================
app.post('/api/department-head/expenditures/add', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }

  const { expenditure_name, expenditure_amount, date } = req.body;
  if (!expenditure_name || !expenditure_amount || !date) {
    return res.status(400).send('Missing required fields.');
  }

  getDeptHeadDepartmentId(req, (err, departmentId) => {
    if (err) return res.status(500).send('Error resolving department.');

    const insertQuery = `
      INSERT INTO expenditures (department_id, expenditure_name, expenditure_amount, date)
      VALUES (?, ?, ?, ?)
    `;
    db.query(insertQuery, [departmentId, expenditure_name, expenditure_amount, date], (qErr) => {
      if (qErr) return res.status(500).send('Error adding expenditure.');

      // Fetch department name for email
      const deptQuery = `SELECT department_name FROM departments WHERE department_id = ? LIMIT 1`;
      db.query(deptQuery, [departmentId], (deptErr, deptResults) => {
        if (deptErr || !deptResults.length) return res.sendStatus(200);
        const departmentName = deptResults[0].department_name;

        // Fetch all admins
        const adminQuery = `SELECT username, email FROM users WHERE role = 'admin'`;
        db.query(adminQuery, (adminErr, admins) => {
          if (adminErr) return res.sendStatus(200);

          admins.forEach(admin => {
            const mailOptions = {
              from: 'blissfulbarfi@gmail.com',
              to: admin.email,
              subject: 'New Expenditure Logged',
              text: `Hello ${admin.username},

There has been an expenditure by a department head.

Department: ${departmentName}
Requested Amount: ${expenditure_amount}
Purpose : ${expenditure_name}
Submission Date: ${new Date(date).toLocaleDateString()}

You may coordinate with the department head concerned if there are any issues.

Regards,
Your Budget Tracking System`
            };

            transporter.sendMail(mailOptions, (err, info) => {
              if (err) console.error('Error sending email:', err);
              else console.log('Email sent:', info.response);
            });
          });

          res.sendStatus(200); // everything done
        });
      });
    });
  });
});


// ==============================
// API: Delete expenditure
// ==============================
app.post('/api/department-head/expenditures/delete', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }

  const { id } = req.body;
  if (!id) return res.status(400).send('Missing expenditure id.');

  getDeptHeadDepartmentId(req, (err, departmentId) => {
    if (err) return res.status(500).send('Error resolving department.');

    const query = `
      DELETE FROM expenditures
      WHERE expenditure_id = ? AND department_id = ?
    `;
    db.query(query, [id, departmentId], (qErr, result) => {
      if (qErr) return res.status(500).send('Error deleting expenditure.');
      if (result.affectedRows === 0) {
        return res.status(403).send('Delete denied or expenditure not in your department.');
      }
      res.sendStatus(200);
    });
  });
});

//delete if smthg goes wrong (2/09/25)
// ==============================
// API: Department Head - Update Budget Request
// ==============================
// ==============================
// API: Department Head - Update Budget Request
// ==============================
// app.post('/api/department-head/budget/update', (req, res) => {
//   if (!req.session.user || req.session.user.role !== 'Department Head') {
//     return res.status(403).send('Access denied. Department Heads only.');
//   }

//   const { department_id, requested_budget } = req.body;
//   const userId = req.session.user.id;

//   console.log("Incoming update request:", { department_id, requested_budget, userId });

//   // Step 1: Get the department_id for this dept head user
//   const deptQuery = `
//     SELECT department_id 
//     FROM users 
//     WHERE id = ? LIMIT 1
//   `;

//   db.query(deptQuery, [userId], (deptErr, deptRows) => {
//     if (deptErr) {
//       console.error("Dept lookup error:", deptErr);
//       return res.status(500).send('Error resolving department.');
//     }
//     if (!deptRows || deptRows.length === 0) {
//       console.log("No department found for this user");
//       return res.status(404).send('Department not found.');
//     }

//     const userDeptId = deptRows[0].department_id;
//     console.log("User belongs to department:", userDeptId);

//     // Step 2: Prevent tampering — only allow their own dept
//     if (Number(userDeptId) !== Number(department_id)) {
//       console.log("Department mismatch! Tried to edit:", department_id, "but user belongs to:", userDeptId);
//       return res.status(403).send('You can only edit your own department.');
//     }

//     // Step 3: Update requested_budget
//     const updateQuery = `UPDATE departments SET requested_budget = ? WHERE department_id = ?`;
//     db.query(updateQuery, [requested_budget, department_id], (updateErr, result) => {
//       if (updateErr) {
//         console.error("Update error:", updateErr);
//         return res.status(500).send('Error updating budget.');
//       }
//       console.log("Update result:", result);

//       if (result.affectedRows === 0) {
//         return res.status(404).send('Department not found or update failed.');
//       }

//       res.sendStatus(200);
//     });
//   });
// });

app.post('/api/department-head/budget/update', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }

  const { requested_budget } = req.body;
  const userId = req.session.user.id;

  getDeptHeadDepartmentId(req, (err, departmentId) => {
    if (err) return res.status(500).send('Error resolving department.');

    const updateQuery = `UPDATE departments SET requested_budget = ? WHERE department_id = ?`;
    db.query(updateQuery, [requested_budget, departmentId], (updateErr, result) => {
      if (updateErr) {
        console.error("Update error:", updateErr);
        return res.status(500).send('Error updating budget.');
      }

      if (result.affectedRows === 0) {
        return res.status(404).send('Department not found or update failed.');
      }

      res.sendStatus(200);
    });
  });
});





//GENERAL EMPLOYEE ROUTES - EMPLOYEE DASHBOARD 

// ==============================
// Employee Dashboard Page
// ==============================
app.get('/employee-dashboard', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'General Employee') {
    return res.status(403).send('Access denied. Employees only.');
  }
  res.sendFile(path.join(__dirname, 'public', 'employee-dashboard.html'));
});

// ==============================
// API: Employee Dashboard Data
// ==============================
app.get('/api/employee-dashboard-data', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'General Employee') {
    return res.status(403).send('Access denied. Employees only.');
  }

  // Step 1: find department_id for this user
  const userId = req.session.user.id;
  const deptIdQuery = `SELECT department_id FROM users WHERE id = ? LIMIT 1`;

  db.query(deptIdQuery, [userId], (err, deptResult) => {
    if (err) return res.status(500).send('Error resolving department.');
    if (!deptResult || deptResult.length === 0) return res.status(404).send('Department not found.');

    const departmentId = deptResult[0].department_id;

    // Step 2: get department budget info
   const departmentQuery = `
  SELECT d.department_id, d.department_name, d.requested_budget, d.admin_comments, d.budget_status,
         u.username AS department_head
  FROM departments d
  LEFT JOIN users u ON d.department_head_id = u.id
  WHERE d.department_id = ?
  LIMIT 1
`;


    db.query(departmentQuery, [departmentId], (deptErr, deptRows) => {
      if (deptErr) return res.status(500).send('Error fetching department data.');
      if (!deptRows || deptRows.length === 0) return res.status(404).send('No department data found.');

      const departmentData = deptRows[0];

      // Step 3: get expenditures for that department
      const expendituresQuery = `
        SELECT SUM(expenditure_amount) AS actual_spent
        FROM expenditures
        WHERE department_id = ?
      `;

      db.query(expendituresQuery, [departmentId], (expErr, expRows) => {
        if (expErr) return res.status(500).send('Error fetching expenditures.');

        const actualSpent = expRows && expRows[0] ? expRows[0].actual_spent || 0 : 0;

        res.json({
          department: departmentData,
          spending: {
            department_name: departmentData.department_name,
            requested_budget: departmentData.requested_budget,
            actual_spent: actualSpent
          }
        });
      });
    });
  });
});


// //Values you want to insert
// const username = 'user2';
// const plainPassword = 'newUserPass123';
// const role = 'General Employee';
// const email = 'sneha.u.gautam@gmail.com';
// const departmentId = 2;

// //FOR WHEN U WANNA INSERT A NEW USER - JUST REPLACE VALUES

// bcrypt.hash(plainPassword, 10, (err, hash) => {
//   if (err) {
//     console.error('Error hashing password:', err);
//     return;
//   }

//   const query = `
//     INSERT INTO users (username, password, role, email, department_id)
//     VALUES (?, ?, ?, ?, ?)
//   `;

//   db.query(query, [username, hash, role, email, departmentId], (qErr, result) => {
//     if (qErr) {
//       console.error('Error inserting user:', qErr);
//     } else {
//       console.log('New user inserted with ID:', result.insertId);
//     }
//   });
// });

// ==============================
// API: Department Head Budget Status
// ==============================
app.get('/api/department-head/budget-status', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Department Head') {
    return res.status(403).send('Access denied. Department Heads only.');
  }

  const userId = req.session.user.id;

  // Step 1: Find department_id for this department head
  const deptQuery = `
    SELECT d.department_id, d.department_name, d.requested_budget, 
           d.budget_status, d.admin_comments, u.username AS department_head
    FROM departments d
    JOIN users u ON d.department_head_id = u.id
    WHERE u.id = ?
  `;

  db.query(deptQuery, [userId], (err, rows) => {
    if (err) {
      console.error("Error fetching budget status:", err);
      return res.status(500).send('Error fetching budget status.');
    }
    res.json(rows); // will be [] if no match
  });
});





// Start Server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});

