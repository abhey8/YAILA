import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    age: { type: Number },
    studySpecifications: { type: String },
    profilePic: { type: String }, // Store the path/URL to the picture
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);
