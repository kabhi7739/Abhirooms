const mongoose = require("mongoose");
const Schema = mongoose.Schema;
// Yahan humne aakhir mein .default joda hai taaki exact function mile
const passportLocalMongoose = require("passport-local-mongoose").default || require("passport-local-mongoose");

const userSchema = new Schema({
    email: {
        type: String,
        required: true
    }
});

// Ab yeh line bina kisi error ke function pakad legi
userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);