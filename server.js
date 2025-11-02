// Get the packages we need
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser'),
    cors = require('cors');

// Read .env file
require('dotenv').config();

// Create our Express application
var app = express();

// Use environment defined port or 3000
var port = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { 
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false
})
.then(() => console.log('MongoDB connected'))
.catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
});

// Enable CORS
app.use(cors());

// Use the body-parser package in our application
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

// Use routes as a module (see index.js)
require('./routes')(app, router);

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        message: 'Server Error', 
        data: null 
    });
});

// Start the server
app.listen(port);
console.log('Server running on port ' + port);
