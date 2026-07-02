const express = require("express");
const app = express();
const mongoose = require("mongoose");
// const Mongo_url = "mongodb://127.0.0.1:27017/wanderlust";const dbUrl = "aapka_naya_cloud_link_yahan_daalo";
const dbUrl = "mongodb+srv://kabhisheksingh04102000_db_user:Cxq1VvYnmTwD4Xh5@cluster0.t94ouyh.mongodb.net/wanderlust?appName=Cluster0";
mongoose.connect(dbUrl)
  .then(() => console.log("Connected to Cloud DB!"))
  .catch(err => console.log(err));
const Listing = require("./models/listing.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");
const Review = require("./models/review.js");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
//  Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));


// 1. Sabse pehle hamesha Session Options aayega
const sessionOptions = {
    secret: "mysupersecretcode",
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 Hafta
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true
    }
};

app.use(session(sessionOptions));

// 2. Session initialize hone ke BAAD hamesha Passport aayega

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
// Middleware: Current User ka data har EJS file ko bhejne ke liye
app.use((req, res, next) => {
    res.locals.currUser = req.user; // req.user mein login user ki details hoti hain
    next();
});
main()
  .then(() => {
    console.log("connected to database");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(dbUrl);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Root Route
app.get("/", (req, res) => {
  res.redirect("/listings");
});

// New Route (Form dikhane ke liye)
app.get("/listings/new", (req, res) => {
  res.render("lisitings/new.ejs");
});

// Show Route (Single listing dekhne ke liye - POPULATE ADDED)
app.get("/listings/:id", wrapAsync(async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id.trim()).populate("reviews");
  res.render("lisitings/show.ejs", { listing });
}));

// review route (POST - FIXED REDIRECT & PARAM)
app.post("/listings/:id/reviews", wrapAsync(async (req, res) => {
    let listing = await Listing.findById(req.params.id.trim());
    
    let newReview = new Review(req.body.review);
    listing.reviews.push(newReview);
    
    await newReview.save();
    await listing.save();
    
    res.redirect(`/listings/${listing._id}`);
}));

// delete review route (DELETE - FIXED BRACKETS MISTAKE)
app.delete("/listings/:id/reviews/:reviewId", wrapAsync(async (req, res) => {
    let { id, reviewId } = req.params;
    
    await Listing.findByIdAndUpdate(id.trim(), { $pull: { reviews: reviewId.trim() } });
    await Review.findByIdAndDelete(reviewId.trim());
    
    res.redirect(`/listings/${id.trim()}`);
}));
// create route
app.post("/listings", wrapAsync(async (req, res, next) => {
    let { title, description, price, location, country, image } = req.body.listing;

    const newListing = new Listing({ title, description, price, location, country });

    if (image && image.trim() !== "") {
        newListing.image = {
            filename: "listingimage",
            url: image.trim()
        };
    }

    await newListing.save();
    res.redirect("/listings");
}));
// Index Route (Saari listings dekhne ke liye)
app.get("/listings", wrapAsync(async (req, res) => {
  const allListing = await Listing.find({});
  res.render("lisitings/index.ejs", { allListing });
}));

// Edit Route (Edit Form dikhane ke liye)
app.get("/listings/:id/edit", wrapAsync(async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id.trim());
  res.render("lisitings/edit.ejs", { listing });
}));

// Update Route (Edit Form Submit hone par update karne ke liye)
app.put("/listings/:id", wrapAsync(async (req, res, next) => {
    let { id } = req.params;
    let data = req.body.listing ? req.body.listing : req.body;

    let updateData = {
        title: data.title,
        description: data.description,
        price: data.price,
        location: data.location,
        country: data.country
    };

    // Agar user ne image field mein koi naya link dala hai, toh hi use badlein
    if (data.image && data.image.trim() !== "") {
        updateData.image = {
            filename: "listingimage",
            url: data.image.trim()
        };
    }

    await Listing.findByIdAndUpdate(id.trim(), updateData);
    
    // Redirect ab sahi jagah par aa gaya hai
    res.redirect(`/listings/${id.trim()}`);
}));
// GET Route: Signup Form Dikhane Ke Liye
app.get("/signup", (req, res) => {
    res.render("users/signup.ejs");
});
// GET Route: Login Form Dikhane Ke Liye
app.get("/login", (req, res) => {
    res.render("users/login.ejs");
});

// POST Route: User Authentication Aur Login Karne Ke Liye
// passport.authenticate() khud check karega ki username aur password sahi hain ya nahi
app.post("/login", 
    passport.authenticate("local", { 
        failureRedirect: "/login", 
        failureMessage: true 
    }), 
    async (req, res) => {
        res.redirect("/listings");
    }
);
// GET Route: User Logout Karne Ke Liye
app.get("/logout", (req, res, next) => {
    // req.logout() ek asynchronous function hai passport ka
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        // Logout hote hi user ko wapas listings page par bhej denge
        res.redirect("/listings");
    });
});

// POST Route: User Register Karne Ke Liye
app.post("/signup", wrapAsync(async (req, res) => {
    try {
        let { username, email, password } = req.body;
        const newUser = new User({ email, username });
        
        // Passport ka register method jo hash aur salt khud handle karega
        const registeredUser = await User.register(newUser, password);
        console.log(registeredUser);
        
        // Register hone ke baad user ko sidhe listings page par bhej denge
        res.redirect("/listings");
    } catch (e) {
        // Agar username ya email pehle se exist karta hai toh error handle hoga
        res.send(e.message);
    }
}));
// Delete Route
app.delete("/listings/:id", wrapAsync(async (req, res) => {
  let { id } = req.params;
  let deletedListing = await Listing.findByIdAndDelete(id.trim());
  console.log(deletedListing);
  res.redirect("/listings");
}));

app.use((err, req, res, next) => {
    // Agar statusCode ya message na ho, toh default fallback dein taaki crash na ho
    let { statusCode = 500, message = "Something went wrong!" } = err;
    res.status(statusCode).send(message); 
});
app.use((req,res,next)=>{
  next(new ExpressError(404,"page nahi mila"))
})

// Server Listen
app.listen(8080, () => {
  console.log("server is listening to port 8080");
});
