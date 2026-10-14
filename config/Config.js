require("dotenv").config();

const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUDINARY_NAME = process.env.CLOUDINARY_NAME;
const PORT = process.env.PORT;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_NAME = process.env.ADMIN_NAME;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;


module.exports = {
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_NAME,
    PORT,
    MONGO_URI,
    ADMIN_NAME,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_JWT_SECRET
};
