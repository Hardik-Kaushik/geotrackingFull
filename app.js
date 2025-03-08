const express = require('express');
const bcrypt = require('bcrypt');
const session = require('express-session');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const collection = require("./src/config");
const { ensureAuthenticated, ensureAdmin } = require('./middleware/auth');
const Location = require('./models/location');
const nodemailer = require('nodemailer');
require('dotenv').config();


const app = express();
const port = 5000;

app.use('/public/', express.static('./public'));

mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000, // Wait up to 30s before timing out
    useNewUrlParser: true,
    useUnifiedTopology: true
  })  
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
  mongoose.set('bufferCommands', false);
  mongoose.set('bufferTimeoutMS', 5000);
    
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

app.get("/", (req, res) => {
    res.render("login");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.post("/signup", async (req, res) => {
    const { username, password, mobile, email } = req.body;

    try {
        const existingUser = await collection.findOne({ username });

        if (existingUser) {
            return res.send("User already exists. Please choose a different username.");
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new collection({
            username,
            password: hashedPassword,
            mobile,
            email
        });

        await newUser.save();
        res.redirect("/");
    } catch (error) {
        console.error("Error signing up:", error);
        res.send("Error signing up. Please try again.");
    }
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await collection.findOne({ username });

        if (!user) {
            return res.send("Username not found. Kindly Signup or check the Credentials properly");
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);

        if (isPasswordMatch) {
            req.session.user = user;
            res.render("home", { user });
        } else {
            res.send("Wrong password.");
        }
    } catch (error) {
        console.error("Error logging in:", error);
        res.send("Error logging in. Please try again.");
    }
});

app.get('/home', ensureAuthenticated, (req, res) => {
    const user = req.session.user;
    res.render('home', { user });
});

app.get('/admin', ensureAdmin, async (req, res) => {
    const perPage = 7;
    const page = req.query.page || 1;

    try {
        const users = await collection.find()
            .skip((perPage * page) - perPage)
            .limit(perPage);
        const count = await collection.countDocuments();

        res.render('admin', {
            users,
            current: page,
            pages: Math.ceil(count / perPage)
        });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.send("Error fetching users. Please try again.");
    }
});

app.get('/geotracking', ensureAuthenticated, (req, res) => {
    const user = req.session.user;
    res.render('geotracking', { user });
});

app.post('/api/locations', ensureAuthenticated, async (req, res) => {
    const { latitude, longitude } = req.body;
    const userId = req.session.user._id;

    // Convert latitude and longitude to numbers
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // Initialize coordinates if not set
    if (!req.session.coordinates) {
        req.session.coordinates = {
            initialLat: lat,
            initialLng: lng
        };
    } else {
        req.session.coordinates.finalLat = lat;
        req.session.coordinates.finalLng = lng;
    }

    const location = new Location({ userId, latitude: lat, longitude: lng, timestamp: new Date() });

    try {
        await location.save();
        res.sendStatus(200);
    } catch (error) {
        console.error('Error saving location:', error);
        res.sendStatus(500);
    }
});

app.post('/end-tracking', ensureAuthenticated, (req, res) => {
    const { enterCount, exitCount, elapsedTime } = req.body;
    const { initialLat, initialLng, finalLat, finalLng } = req.session.coordinates;

    // Pass coordinates and tracking statistics to the results page
    res.render('results', { 
        initialLat: parseFloat(initialLat), 
        initialLng: parseFloat(initialLng), 
        finalLat: parseFloat(finalLat), 
        finalLng: parseFloat(finalLng), 
        enterCount: parseInt(enterCount, 10),
        exitCount: parseInt(exitCount, 10),
        elapsedTime: parseFloat(elapsedTime)
    });

    // Send email to the user with tracking results
    const transporter = nodemailer.createTransport({
        host: 'smtp.mailbit.io',
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: { rejectUnauthorized: false }
    });
    

    const mailOptions = {
        from: 'neerajkaushik1969@gmail.com',
        to: req.session.user.email,
        subject: 'Your Geotracking Results',
        text: `Hello ${req.session.user.username},\n\nHere are your geotracking results:\n\nInitial Coordinates: Latitude ${initialLat}, Longitude ${initialLng}\nFinal Coordinates: Latitude ${finalLat}, Longitude ${finalLng}\nTotal Entries: ${enterCount}\nTotal Exits: ${exitCount}\nTotal Elapsed Time: ${elapsedTime} seconds\n\nThank you for using our service!`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error:', error);
        } else {
            console.log('Email successfully sent:', info.response);
        }
    });
});

app.get('/results', ensureAuthenticated, (req, res) => {
    const { enterCount, exitCount, elapsedTime } = req.query;

    res.render('results', {
        enterCount: parseInt(enterCount, 10),
        exitCount: parseInt(exitCount, 10),
        elapsedTime: parseFloat(elapsedTime),
        initialLat: parseFloat(req.session.coordinates.initialLat),
        initialLng: parseFloat(req.session.coordinates.initialLng),
        finalLat: parseFloat(req.session.coordinates.finalLat),
        finalLng: parseFloat(req.session.coordinates.finalLng)
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error logging out:', err);
        }
        res.redirect('/');
    });
});
app.get('/internal-navigation', ensureAuthenticated, (req, res) => {
    res.render('internal-navigation');
});


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
