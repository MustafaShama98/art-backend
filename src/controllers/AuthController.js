const express = require('express');
const router = express.Router();
const {User} = require("../models/User");

router.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        // const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ username, password: password });
        res.status(201).json({ message: 'User created' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        // Check if the user exists and the password matches directly
        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Store session details
        req.session.userId = user._id;
        req.session.userRole = user.role;

        res.json({ message: 'Logged in', data: user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});


router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

module.exports = router