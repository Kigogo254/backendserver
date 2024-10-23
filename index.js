const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MySQL connection pool setup
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Log DB connection details (optional)
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);

// Home route
app.get('/', (req, res) => {
  return res.json('From Kigogo Backend');
});

// Fetch all users
app.get('/all-users', (req, res) => {
  const query = 'SELECT * FROM users';
  pool.query(query, (error, results) => {
    if (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ message: 'Error fetching users' });
    }
    res.status(200).json(results);
  });
});

// Function to validate phone number
const isValidPhoneNumber = (phone_number) => {
  const phoneRegex = /^0\d{9}$/; // Must start with 0 and be exactly 10 digits
  return phoneRegex.test(phone_number);
};

// Function to validate password
const isValidPassword = (password) => {
  return password.length >= 4 && password.length <= 8; // Password length should be between 4 and 8 characters
};

// Registration endpoint
app.post('/register', (req, res) => {
  const {
    phone_number,
    user_name,
    password,
    tiktok_name,
    youtube_name,
    instagram_name,
    referral_code,
  } = req.body;

  // Check for required fields
  if (!phone_number || !user_name || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  // Validate phone number
  if (!isValidPhoneNumber(phone_number)) {
    return res.status(400).json({ message: 'Phone number must be exactly 10 digits and start with 0.' });
  }

  // Validate password
  if (!isValidPassword(password)) {
    return res.status(400).json({ message: 'Password must be between 4 and 8 characters.' });
  }

  // Check if the phone number already exists
  const phoneCheckQuery = 'SELECT * FROM users WHERE phone_number = ?';
  pool.query(phoneCheckQuery, [phone_number], (phoneCheckError, phoneCheckResults) => {
    if (phoneCheckError) {
      console.error('Database error while checking phone number:', phoneCheckError);
      return res.status(500).json({ message: 'Error checking phone number.' });
    }

    if (phoneCheckResults.length > 0) {
      return res.status(400).json({ message: 'Phone number already exists.' });
    }

    // Check if the referral code exists
    const referralQuery = 'SELECT * FROM users WHERE referral_code = ?';
    pool.query(referralQuery, [referral_code], (referralError, referralResults) => {
      if (referralError) {
        console.error('Database error while checking referral code:', referralError);
        return res.status(500).json({ message: 'Error checking referral code.' });
      }

      // If the referral code does not exist, return an error
      if (referralResults.length === 0) {
        return res.status(400).json({ message: 'Invalid referral code.' });
      }

      // Increment the referrals count for the user with the referral code
      const userWithReferralCode = referralResults[0];
      const updateReferralCountQuery = 'UPDATE users SET referrals = referrals + 1 WHERE id = ?';
      pool.query(updateReferralCountQuery, [userWithReferralCode.id], (updateError) => {
        if (updateError) {
          console.error('Database error while updating referrals:', updateError);
          return res.status(500).json({ message: 'Error updating referrals.' });
        }

        // Generate a unique referral code
        const generateReferralCode = () => {
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const numbers = '0123456789';
          const randomLetters = Array.from({ length: 3 }, () => letters.charAt(Math.floor(Math.random() * letters.length))).join('');
          const randomNumbers = Array.from({ length: 3 }, () => numbers.charAt(Math.floor(Math.random() * numbers.length))).join('');
          return `${randomLetters}${randomNumbers}`;
        };

        // Function to insert the new user
        const registerUser = (referralCode) => {
          // Hash the password
          bcrypt.hash(password, 10, (hashError, hash) => {
            if (hashError) {
              return res.status(500).json({ message: 'Error hashing password.' });
            }

            const insertQuery = `
              INSERT INTO users 
              (phone_number, user_name, password, tiktok_name, youtube_name, instagram_name, referral_code, referrepooly, 
              bonusAmountTL, bonusAmountRefs, bonusAmountTasks, balance, referrals) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            pool.query(insertQuery, [
              phone_number,
              user_name,
              hash,
              tiktok_name,
              youtube_name,
              instagram_name,
              referralCode,
              referral_code,
              0, // bonusAmountTL
              0, // bonusAmountRefs
              0, // bonusAmountTasks
              100, // balance
              0, // referrals
            ], (insertError) => {
              if (insertError) {
                console.error('Database error while creating user:', insertError);
                return res.status(500).json({ message: 'Error creating user.', error: insertError });
              }
              res.status(201).json({ message: 'User created successfully.', referral_code: referralCode });
            });
          });
        };

        // Start checking for a unique referral code
        let newReferralCode;
        const checkReferralCode = (code, callback) => {
          const codeCheckQuery = 'SELECT * FROM users WHERE referral_code = ?';
          pool.query(codeCheckQuery, [code], (error, results) => {
            if (error) {
              callback(true);
            } else {
              callback(results.length > 0);
            }
          });
        };

        const findUniqueReferralCode = () => {
          newReferralCode = generateReferralCode();
          checkReferralCode(newReferralCode, (exists) => {
            if (exists) {
              findUniqueReferralCode();
            } else {
              registerUser(newReferralCode);
            }
          });
        };

        findUniqueReferralCode();
      });
    });
  });
});

// Login endpoint
app.post('/login', (req, res) => {
  const { phone_number, password } = req.body;

  // Check for required fields
  if (!phone_number || !password) {
    return res.status(400).json({ message: 'Phone number and password are required.' });
  }

  const query = 'SELECT * FROM users WHERE phone_number = ?';
  pool.query(query, [phone_number], (error, results) => {
    if (error) {
      console.error('Database error during login:', error);
      return res.status(500).json({ message: 'Error during login.' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'Invalid phone number or password.' });
    }

    const user = results[0];
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({ message: 'Error during password comparison.' });
      }

      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid phone number or password.' });
      }

      const { password, ...userData } = user; // Exclude password from the response
      res.status(200).json({ message: 'Login successful.', user: userData });
    });
  });
});

// Withdraw endpoint
app.post('/withdraw', (req, res) => {
  const { phone_number, amount } = req.body;

  const query = 'SELECT * FROM users WHERE phone_number = ?';
  pool.query(query, [phone_number], (error, results) => {
    if (error) {
      return res.status(500).json({ message: 'Database error.' });
    }

    if (results.length === 0 || results[0].balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance or user not found.' });
    }

    const currentBalance = results[0].balance;

    // Ensure balance doesn't go below Ksh. 100
    if (currentBalance - amount < 100) {
      return res.status(400).json({ success: false, message: 'Insufficient balance. Cannot leave less than Ksh. 100.' });
    }

    const updateBalance = currentBalance - amount;
    const updateQuery = 'UPDATE users SET balance = ? WHERE phone_number = ?';
    pool.query(updateQuery, [updateBalance, phone_number], (updateError) => {
      if (updateError) {
        return res.status(500).json({ message: 'Error updating balance.' });
      }
      res.status(200).json({ success: true, message: 'Withdrawal successful.' });
    });
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
