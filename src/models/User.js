const mongoose = require('mongoose');
const {hash} = require("bcrypt");

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' }
});



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
            // Hash the password
            const hashedPassword = await hash(user.password, 10);
            user.password = hashedPassword;

            // Save the user to the database
            await User.create(user);
            console.log(`User '${user.username}' created.`);
        } else {
            console.log(`User '${user.username}' already exists.`);
        }
    }
}

// Export the User model and seed function
module.exports = { User, seedUsers };