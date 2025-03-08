const mongoose = require("mongoose");
require('dotenv').config();

const connect = mongoose.connect(process.env.MONGO_URI);

connect.then(() => {
    console.log("Database connected Successfully");
}).catch(() => {
    console.log("Database cannot be connected");
});

const LogInSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    role: {
        type: String,
        default: 'viewer'
    }
});

const collection = mongoose.model("users", LogInSchema);

module.exports = collection;
