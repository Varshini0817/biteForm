const express = require('express');
const path = require('path');
const hbs = require('hbs');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');
const {User,Message} = require('./mongodb');  // Updated import based on module.exports
const moment = require('moment-timezone');
const multer = require('multer'); // Import multer for file upload
const fs = require('fs');
const methodOverride = require('method-override')
const cron = require('node-cron');
// index.js

const { transporter, sendEmail } = require('./emailScheduler'); // Adjust the path as needed


dotenv.config();


// Schedule email sending
cron.schedule('57 9,12,19 * * *', async () => { // Runs at 9 AM, 12 PM, and 7 PM IST
    const now = moment().tz('Asia/Kolkata');
    const users = await User.find({ role: { $ne: 'admin' } });

    if (now.hours() === 9) {
        users.forEach(user => {
            sendEmail(user.email, "Tab's Active", `Hello ${user.name} \nBreakfast tab is now active\nTap on the link below 👇 right now to submit the form\nhttps://form-i3hj.onrender.com/`);
        });
    } else if (now.hours() === 12) {
        users.forEach(user => {
            sendEmail(user.email, "Tab's Active", `Hello ${user.name} \nLunch tab is now active\nTap on the link below 👇 right now to submit the form\nhttps://form-i3hj.onrender.com/`);
        });
    } else if (now.hours() === 19) {
        users.forEach(user => {
            sendEmail(user.email, "Tab's Active", `Hello ${user.name} \nSupper tab is now active\nTap on the link below 👇 right now to submit the form\nhttps://form-i3hj.onrender.com/`);
        });
    }
});

// Schedule email reminders
cron.schedule('45 11,15,21 * * *', async () => { // Runs at 11:45 AM, 3:45 PM, and 9:45 PM IST
    const now = moment().tz('Asia/Kolkata');
    const users = await User.find({ role: { $ne: 'admin' } });

    for (const user of users) {
        const hasSubmittedBreakfast = user.tab.breakfast.some(form => moment(form.timestamp).isSame(now, 'day'));
        const hasSubmittedLunch = user.tab.lunch.some(form => moment(form.timestamp).isSame(now, 'day'));
        const hasSubmittedSupper = user.tab.supper.some(form => moment(form.timestamp).isSame(now, 'day'));

        if (!hasSubmittedBreakfast && now.hours() === 9 && now.minutes() === 45) {
            sendEmail(user.email, 'Reminder: Fill the breakfast form', `Hello ${user.name} \nDon't forget to fill the breakfast form for today!`);
        }
        if (!hasSubmittedLunch && now.hours() === 15 && now.minutes() === 45) {
            sendEmail(user.email, 'Reminder: Fill the lunch form', `Hello ${user.name} \nDon't forget to fill the lunch form for today!`);
        }
        if (!hasSubmittedSupper && now.hours() === 21 && now.minutes() === 45) {
            sendEmail(user.email, 'Reminder: Fill the supper form', `Hello ${user.name} \nDon't forget to fill the supper form for today!`);
        }
    }
});

// Log message to indicate the application is running
console.log('Node.js application running with cron jobs...');
const app = express();
const templatePath = path.join(__dirname, '../templates');
const uploadPath = path.join(__dirname, '../uploads');

app.use('/uploads', express.static(uploadPath)); 
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
    store: MongoStore.create({
        mongoUrl: 'mongodb+srv://vedhavarshiniy111:NkwsKNXYdpVzHsq9@people.vzfrxax.mongodb.net/project?retryWrites=true&w=majority&appName=People',
        collectionName: 'sessions'
      }),
    secret: 'jekskajdjsksksks',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.set('view engine', 'hbs');
app.set('views', templatePath);

app.get('/forgotPassword',(req,res)=>{
    res.render('forgotPassword')
})

app.post('/forgot-password', async (req, res) => {
    try {
        const  username  = req.body.username;
        const user = await User.findOne({ name: username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
            return res.status(200).json({ email: user.email }); // Send email data as JSON
        
    }
    catch(err)
    {
        res.status(500).json({error: "Internal server error"})
    }
})
//const clipboardy = require('clipboardy');

app.post('/sendResetCode/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const { email } = req.body; // Retrieve email from the request body
  
      // Find the user by name or create a new user if they don't exist
      let user = await User.findOneAndUpdate(
        { name },
        {},
        { upsert: true, new: true }
      );
  
      const resetCode = await generateResetCode(); // Implement your own random code generation logic
      const expiryTime = new Date();
      expiryTime.setMinutes(expiryTime.getMinutes() + 5); // Expiry time 5 minutes from now
  
      // Update user document with new reset code and expiry time
      user.resetCode = resetCode;
      user.codeExpiryTime = expiryTime;
      await user.save(); // Save the updated user document to the database
  
      // Send reset code/token to the provided email
      sendEmail(email, "Reset Code", `Hello ${name}!!! \nHere's your reset code \nReset code: ${resetCode} \nValid for 5 minutes\nReset your password with this reset code within 5 minutes`);
  
      res.status(200).json({ message: 'Reset code sent successfully' });
    } catch (error) {
      console.error('Error sending reset code:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
async function generateResetCode() {
    // Generate a random 6-digit code
    return Math.floor(100000 + Math.random() * 900000).toString();
}


// Verify Reset Code Route
app.post('/verifyResetCode', async (req, res) => {
    try {
        const { username, resetCode } = req.body;
        const user = await User.findOne({ name: username });
        //console.log(user)
        //console.log(new Date())
        const userCodeExpiryTime = new Date(user.codeExpiryTime); // Convert user's expiry time to a Date object
        if (user && user.resetCode === resetCode && userCodeExpiryTime > new Date()) {
            res.status(200).json({ message: 'Reset code verified successfully' });
        } else {
            res.status(400).json({ message: 'Invalid or expired reset code' });
        }
    } catch (error) {
        console.error('Error verifying reset code:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/resetPassword', (req, res) => {
    const username = req.query.username;
    res.render('resetPassword', { username }); // Assuming EJS template, passing username to template
  });


app.post('/resetPassword',async(req,res)=>{
    try{
    const name = req.body.username;
    const newpassword = req.body.password;

    const user = await User.findOne({name})
    if(!user){
        return res.status(400).json({error: "User not found"});
    }
    const hashedPassword = await bcrypt.hash(newpassword,10)
    user.password = hashedPassword;
    user.resetCode=undefined
    user.codeExpiryTime=undefined
    await user.save();
    sendEmail(user.email,"Password reset",`Hello ${user.name}! \nYour passowrd of your account with email: ${user.email} is successfully updated`)
    res.status(200).json({message: "Password updated successfully!"});

    }
    catch(error){
        console.log(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

// Route to get user profile data (for simplicity, using a fixed user)
app.get('/user/:name', async (req, res) => {
    const uname = req.session.userName;
    if (!uname) {
        return res.redirect('/signin');
    }
    const name = req.params.name;
    const user = await User.findOne({ name });
    if (!user) {
      return res.status(404).send('User not found');
    }
    res.send(user);
  });
  
  // Route to update phone number
  app.post('/updatePhone/:name', async (req, res) => {
    const { phone } = req.body;
    const name = req.params.name;
  
    try {
      const user = await User.findOneAndUpdate({ name }, { phone }, { new: true, upsert: true });
      console.log(user)
      await user.save()
      res.status(200).send('Phone number updated successfully');
      sendEmail(user.email,"Phone number update",`Hello ${user.name}\nYour phone number is updated to ${user.phone}successfully !\n`)
    } catch (error) {
      console.error('Error updating phone number:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // Route to update password
  app.post('/updatePassword/:name', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const name = req.params.name;
    console.log(name)
  
    try {
      const user = await User.findOne({ name });
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(401).send('Incorrect current password');
      }
  
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      await user.save();
  
      
      sendEmail(user.email,"Password update",`Hello ${user.name}! \nYour passowrd of your account with email: ${user.email} is successfully updated`)
      res.status(200).render('signin', { message: 'Password updated successfully' });
    } catch (error) {
      console.error('Error updating password:', error);
      res.status(500).send('Internal Server Error');
    }
  });


app.get("/", (req, res) => {
    res.render("home");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.post('/signup', async (req, res) => {
    const { name, email, password, rep_password: repPassword, role } = req.body;

    // Check if passwords match
    if (password !== repPassword) {
        return res.render('signup', { error: 'Passwords do not match' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if username already exists
    const checkName = await User.findOne({ name });
    if (checkName) {
        return res.render('signup', { error: 'Username taken' });
    }

    // Check if email already exists
    const checkEmail = await User.findOne({ email });
    if (checkEmail) {
        return res.render('signup', { error: 'Email already registered' });
    }
    if(role==="admin")
        {
            res.render('signup',{error:"You cannot be an admin!"})
        }
    else{
        // Create the user
        await User.create({ name, email, password: hashedPassword, role , tab: { breakfast: [], lunch: [], supper: [] }});
        sendEmail("vedhavarshini.y111@gmail.com","New user registration",`A new user with name ${name} and email ${email} is registered!`)
        sendEmail(email,"Registration successful",`Hello ${name}!\nThank you for registering for this account. \nWe are excited to have you join our community. \nYour registration has been successfully completed, and you can now enjoy all the features and benefits we offer.🎉🎉`)

        // Render success message
        res.render('signup', { success: 'Account created successfully!' });
    }
});


app.get("/signin", (req, res) => {
    res.render("signin");
});

app.post('/signin', async (req, res) => {
    try {
        const { name, password, role } = req.body;
        const user = await User.findOne({ name });

        if (!user ) {
            return res.render('signin', { error: 'Incorrect details' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.render('signin', { error: 'Incorrect details' });
        }

        req.session.userName = user.name; // Store the username in the session

        // Redirect based on the role
        if (role === 'user') {
            return res.redirect('/user');
        } else if (role === 'admin') {
            return res.redirect('/admin');
        } else {
            return res.status(400).send('Invalid role');
        }
    } catch (error) {
        console.error('Error signing in:', error);
        return res.status(500).send('Internal server error');
    }
});



// Add these imports at the top
const { ObjectId } = require('mongoose').Types; // Import ObjectId for MongoDB queries

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server);


// Middleware to check if a user is authenticated
const isAuthenticated = (req, res, next) => {
        const name = req.session.userName;
    if (!name) {
        return res.redirect('/signin');
    }
    next();
};
// Register a Handlebars helper for URL encoding
hbs.registerHelper('urlEncode', function(value) {
    return encodeURIComponent(value);
});

// Route to get user page
app.get('/user', isAuthenticated, async (req, res) => {
    const name = req.session.userName;
    if (!name) {
        return res.redirect('/signin');
    }
    try {
        const user = await User.findOne({ name });
        if (!user) {
            return res.status(404).send('User not found');
        }

        const storedTabStates = req.session.tabStates || {};
        const noCustomWallpaper = !user.wallpaper;

        res.render('user', {
            name: user.name,
            feedbackSchema: user.tab,
            storedTabStates: storedTabStates,
            noCustomWallpaper: noCustomWallpaper
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Socket.IO integration
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('join', (username) => {
        socket.join(username);
        console.log(`${username} joined room`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });

    socket.on('sendMessage', async ({ sender, recipient, content }) => {
        try {
            const message = await Message.create({ sender, recipient, content });

            io.to(recipient).emit('receiveMessage', message);
            io.to(sender).emit('messageSent', message);
        } catch (error) {
            console.error('Error sending message:', error);
        }
    });
});

// Route to render the admin chat page
app.get('/adminChat/:name', isAuthenticated, async (req, res) => {
    const name = req.params.name;
    try {
        const user = await User.findOne({ name });
        if (!user || user.role !== 'admin') {
            return res.status(404).send('Admin not found');
        }

        const users = await User.find({ role: 'user' });
        res.render('adminChat', { users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for sending messages from the admin to a user
app.post('/send-message/:recipient', isAuthenticated, async (req, res) => {
    try {
        const sender = req.session.userName; // Use session to determine the sender (admin)
        const recipient = req.params.recipient;
        const { content } = req.body;

        const message = await Message.create({ sender, recipient, content });

        io.to(recipient).emit('receiveMessage', message);

        res.status(201).json(message);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route for fetching messages for a particular user or the admin
app.get('/messages/:recipient', isAuthenticated, async (req, res) => {
    try {
        const recipient = req.params.recipient;
        const sender = req.session.userName;

        const messages = await Message.find({
            $or: [
                { sender: recipient, recipient: sender },
                { sender: sender, recipient: recipient }
            ]
        });

        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Endpoint to fetch user data from the session
app.get('/userdata', async (req, res) => {
    const name = req.session.userName;

    try {
        const user = await User.findOne({ name });

        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: 'User data not found in session' });
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/updateTabStates', async (req, res) => {
    const { name, tabStates } = req.body;

    try {
        const user = await User.findOne({ name });

        if (user) {
            user.tabStates = tabStates;
            await user.save();
            res.status(200).send('Tab states updated successfully');
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        console.error('Error updating tab states:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/user', async (req, res) => {
    try {
        const { name, ate, reason, tablets, tab } = req.body;

        // Validate the tab value
        const validTabs = ['breakfast', 'lunch', 'supper'];
        if (!validTabs.includes(tab)) {
            return res.status(400).send(`Invalid tab value: ${tab}`);
        }

        // Fetch user's profile from the database
        const user = await User.findOne({ name });

        if (!user) {
            return res.status(404).send('User not found');
        }

        // Initialize tab structure if not already present
        if (!user.tab) {
            user.tab = { breakfast: [], lunch: [], supper: [] };
        }

        // Initialize specific tab array if not already present
        if (!user.tab[tab]) {
            user.tab[tab] = [];
        }

        // Check if the user has already submitted the form for the given tab
        const today = new Date().setHours(0, 0, 0, 0);
        const hasSubmittedFormToday = user.tab[tab].some(form => {
            return new Date(form.timestamp).setHours(0, 0, 0, 0) === today;
        });

        if (hasSubmittedFormToday) {
            return res.render('user', { name: user.name, userData: JSON.stringify(user), success: `Form already submitted for ${tab}` });
        }

        console.log(JSON.stringify(user));

        // Retrieve email from user's profile
        const userEmail = user.email;

        // Construct the feedback entry
        const newFormEntry = {
            name,
            email: userEmail, // Use the retrieved email
            ate,
            reason,
            tablets,
            timestamp: moment().tz('Asia/Kolkata').format() // Store the timestamp in IST
        };
        console.log(newFormEntry);

        // Push the new form entry to the appropriate tab array in the user's profile
        user.tab[tab].push(newFormEntry);
        await user.save();

        sendEmail(user.email, "Submission status", `Your form for ${tab} is successfully submitted!\nThank you for taking time to fill out this form\nHave a great day:)`);
        return res.render('user', { name, userData: JSON.stringify(user), feedbackForms: user.tab[tab], success: 'Form submitted successfully!' });
    } catch (error) {
        console.error('Error submitting form:', error);
        return res.status(500).send('Internal Server Error');
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const username = req.params.name;
        
        // Delete previous images with different extensions
        fs.readdir(uploadPath, (err, files) => {
            if (err) {
                console.error('Error reading directory:', err);
                return cb(err);
            }

            files.forEach(file => {
                if (file.startsWith(`${username}_wallpaper`) && file !== `${username}_wallpaper${path.extname(file)}`) {
                    fs.unlink(path.join(uploadPath, file), err => {
                        if (err) {
                            console.error('Error deleting file:', err);
                        }
                    });
                }
            });
        });

        const fileExtension = path.extname(file.originalname); // Get the file extension
        const filename = `${username}_wallpaper${fileExtension}`; // Construct the filename
        req.usernameWallpaper = filename; // Store the filename in request object
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

app.post('/update-wallpaper/:name', upload.single('wallpaper'), async (req, res) => {
    try {
        //const username = req.session.userName;
        const username = req.params.name; // Ensure it's properly encoded
        //const username = decodeURIComponent(encodedName); // Decode if necessary
       // console.log('Received username:', username);

        const wallpaperPath = req.file.path; // Path of the uploaded wallpaper

        // Update the wallpaper path for the user in the database
        const updatedUser = await User.findOneAndUpdate(
            { name: username }, // Find user by username
            { wallpaper: wallpaperPath }, // Update wallpaper path
            { new: true } // Return updated document
        );

        //console.log('Updated user:', updatedUser);

        if (!updatedUser) {
            console.error('User not found:', username);
            return res.status(404).send('User not found');
        }

        //console.log('Wallpaper updated for user:', username);

        // Extract the file extension
        const fileExtension = path.extname(req.file.originalname);
        
        // Send the username and the extension in the response
        res.json({ username, fileExtension });
    } catch (error) {
        console.error('Error uploading wallpaper:', error);
        return res.status(500).send('Internal Server Error');
    }
});

const fsExtra = require('fs-extra');
app.post('/delete-wallpaper/:name', async (req, res) => {
    const name = req.params.name;

    try {
        const user = await User.findOne({ name });
        if (user) {
            const wallpaperPath = user.wallpaper;
            console.log(wallpaperPath);

            const fileExtension = path.extname(wallpaperPath);
            // Remove the wallpaper path from the database
            user.wallpaper = undefined;
            await user.save();

            // Delete the wallpaper file
            fsExtra.remove(wallpaperPath)
                .then(() => {
                    console.log('File deleted successfully');
                })
                .catch((err) => {
                    console.error('Error deleting file:', err);
                });
                //console.log(user.name,fileExtension)
                res.json({ success: true, username: user.name, fileExtension: fileExtension }); // Return JSON response
        }
        
    } catch (error) {
        console.error('Error deleting wallpaper:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


// Register Handlebars helper function to format date
hbs.registerHelper('formatDate', function (timestamp) {
    return moment(timestamp).tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm:ss');
});

// Register Handlebars helper function for equality check
hbs.registerHelper('eq', function (a, b) {
    return a === b;
});

app.get('/admin', async (req, res) => {
    const name = req.session.userName;
    if (!name) {
        return res.redirect('/signin');
    }
    try {
        // Fetch all non-admin users
        const users = await User.find({ role: { $ne: 'admin' } });

        // Collect all unique dates from the entries
        const allDates = new Set();
        users.forEach(user => {
            ['breakfast', 'lunch', 'supper'].forEach(meal => {
                user.tab[meal].forEach(entry => {
                    allDates.add(moment(entry.timestamp).format('DD-MM-YYYY'));
                });
            });
        });

        // Sort dates in descending order
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(b) - new Date(a));

        // Ensure each date has an entry for each user
        const groupedUsers = {};
        sortedDates.forEach(date => {
            groupedUsers[date] = users.map(user => {
                const getEntriesForMeal = meal => {
                    const entries = user.tab[meal].filter(entry => moment(entry.timestamp).format('DD-MM-YYYY') === date);
                    return entries.length ? entries : [{ name: '', ate: '', reason: '', tablets: '', timestamp: '' }];
                };

                return {
                    name: user.name,
                    wallpaper: user.wallpaper,
                    tab: {
                        breakfast: getEntriesForMeal('breakfast'),
                        lunch: getEntriesForMeal('lunch'),
                        supper: getEntriesForMeal('supper'),
                    },
                };
            });
        });

        res.render('admin', { admin:name,groupedUsers });
    } catch (error) {
        console.error('Error fetching non-admin users:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get("/userChat",(req,res)=>{
    const name = req.session.userName;
    if (!name) {
        return res.redirect('/signin');
    }
    res.render('userChat')
})


app.get("/profile/:name", async (req, res) => {
    const uname = req.session.userName;
    if (!uname) {
        return res.redirect('/signin');
    }
    const name = req.params.name;
    if (!name) {
        return res.status(400).send('User name is required');
    }
    try {
        // Fetch the particular user by name
        const user = await User.findOne({ name });
        if (!user) {
            return res.status(404).send('User not found');
        }
    
        // Pass user data to the profile template
        res.render('profile', { user });
    } catch (error) {
            console.error('Error fetching user:', error);
            res.status(500).send('Internal Server Error');
    }
});

// User route
app.get('/dataUser/:name', async (req, res) => {
    const uname = req.session.userName;
    if (!uname) {
        return res.redirect('/signin');
    }
    const name = req.params.name; // Assuming the user's name is passed as a query parameter
    if (!name) {
        return res.status(400).send('User name is required');
    }
    try {
        // Fetch the particular user by name
        const user = await User.findOne({ name });

        if (!user) {
            return res.status(404).send('User not found');
        }

        // Collect all unique dates from the entries
        const allDates = new Set();
        ['breakfast', 'lunch', 'supper'].forEach(meal => {
            user.tab[meal].forEach(entry => {
                allDates.add(moment(entry.timestamp).format('DD-MM-YYYY'));
            });
        });

        // Sort dates in descending order
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(b) - new Date(a));

        // Ensure each date has an entry for each meal
        const groupedUser = {};
        sortedDates.forEach(date => {
            const getEntriesForMeal = meal => {
                const entries = user.tab[meal].filter(entry => moment(entry.timestamp).format('DD-MM-YYYY') === date);
                return entries.length ? entries[0] : { name: '', ate: '', reason: '', tablets: '', timestamp: '' };
            };

            groupedUser[date] = {
                name: user.name,
                wallpaper: user.wallpaper,
                tab: {
                    breakfast: getEntriesForMeal('breakfast'),
                    lunch: getEntriesForMeal('lunch'),
                    supper: getEntriesForMeal('supper')
                }
            
            };
            
        });
           // console.log(groupedUser)
            res.render('dataUser', { name: name ,groupedUser });
        
        
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).send('Internal Server Error');
    }
});



// app.use(methodOverride("_method"))

// app.delete("/logout", (req, res) => {
//     req.session.destroy((err) => {
//         if (err) {
//             console.error('Error logging out:', err);
//             return res.status(500).send('Could not log out.');
//         }
//         res.redirect('/');
//     });
// });

// app.get('/logout', (req, res) => {
//     req.session.destroy((err) => {
//         if (err) {
//             return res.status(500).send('Could not log out.');
//         }
//         res.redirect('/');
//     });
// });

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Could not log out.');
        }
        res.redirect('/');
    });
});




app.listen(3000, () => {
    console.log("Port connected");
});
