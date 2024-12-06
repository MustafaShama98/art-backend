const mongoose = require('mongoose');

// Define the User schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' }
});

// Create the User model
const User = mongoose.model('User', userSchema);

// Add constant users (admin and worker)
async function seedUsers() {
    const users = [
        { username: 'admin', password: '1234', role: 'admin' },
        { username: 'worker', password: '1234', role: 'worker' }
    ];

    for (const user of users) {
        // Check if the user already exists
        const existingUser = await User.findOne({ username: user.username });
        if (!existingUser) {
            // Save the user to the database directly (no hashing)
            await User.create(user);
            console.log(`User '${user.username}' created.`);
        } else {
            console.log(`User '${user.username}' already exists.`);
        }
    }
}

// Export the User model and seed function
module.exports = { User, seedUsers };
