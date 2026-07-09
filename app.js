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

const flash = require("connect-flash");
//  Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));
app.use((req, res, next) => {
    res.locals.currUser = req.user; // Yeh line bohot zaroori hai!
    next();
});

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
app.use(flash()); 

// 2. Session initialize hone ke BAAD hamesha Passport aayega

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
// Flash ko chalane ke liye middleware


// Middleware: Current User aur Flash messages ka data har EJS file ko bhejne ke liye
app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
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
 // Middleware to check if user is logged in
const isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
        // Agar user logged in nahi hai
        return res.redirect("/login"); 
    }
    next(); // Agar logged in hai, toh aage badhne do
};
app.post("/login", 
    passport.authenticate("local", { 
        failureRedirect: "/login", 
        failureFlash: true 
    }), 
    (req, res) => {
        req.flash("success", "Welcome back to AbhiRooms! Dil se swagat hai."); 
        let redirectUrl = res.locals.redirectUrl || "/listings";
        res.redirect(redirectUrl);
    }
);
app.get("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.flash("success", "You are logged out successfully! See you soon.");
        res.redirect("/listings");
    });
});
// Middleware to check if the user is the Main Admin (Abhishek)
const isAdmin = (req, res, next) => {
    // Tumhara exact username ya tumhari registered email id yahan check hogi
    if (req.isAuthenticated() && (req.user.username === "abhiadmin" || req.user.isAdmin)) {
        return next(); // Agar tum ho, toh aage badhne do
    }
    return res.status(403).send("Access Denied: Sirf Abhishek hi iska admin hai!");
};
// Root Route
app.get("/", (req, res) => {
  res.redirect("/listings");
});

// New Route (Form dikhane ke liye)
app.get("/listings/new", isLoggedIn, (req, res) => {
    res.render("lisitings/new.ejs");
});

// Show Route (Single listing dekhne ke liye - NESTED POPULATE FOR REVIEW AUTHOR & OWNER)
// Show Route - Updated with nested populate for review authors
app.get("/listings/:id", wrapAsync(async (req, res) => {
    let { id } = req.params;
    
    
    const listing = await Listing.findById(id.trim())
        .populate({
            path: "reviews",
            populate: {
                path: "author" // Har ek review ke author ka data nikaalo
            }
        })
        .populate("owner"); // Listing ke owner ka data nikaalo

    if (!listing) {
        return res.status(404).send("Listing not found!");
    }
    
    res.render("lisitings/show.ejs", { listing });
}));

// review route (POST - FIXED FOR AUTHOR & PROTECTION)
app.post("/listings/:id/reviews", isLoggedIn, wrapAsync(async (req, res) => {
    let listing = await Listing.findById(req.params.id.trim());
    
    let newReview = new Review(req.body.review);
    
    // IMPORTANT: Review likhne wale logged-in user ki ID ko save karna
    newReview.author = req.user._id; 
    
    listing.reviews.push(newReview);
    
    await newReview.save();
    await listing.save();
    
    res.redirect(`/listings/${listing._id}`);
}));
// delete review route (DELETE - SECURED WITH isLoggedIn)
// delete review route (Sirf ALTONER/AUTHOR ya MAIN ADMIN delete kar sakta hai)
// Review Delete Route (SECURED: Admin bypass ke saath)
app.delete("/listings/:id/reviews/:reviewId", isLoggedIn, wrapAsync(async (req, res) => {
    let { id, reviewId } = req.params;

    // 1. Pehle review ko database mein dhoondho
    let review = await Review.findById(reviewId);
    
    if (!review) {
        req.flash("error", "Review not found!");
        return res.redirect(`/listings/${id}`);
    }

    // 2. SAFE CHECK: Agar logged-in user admin hai, ya review ka author khud current user hai
    if (req.user && (req.user.username === 'abhiadmin' || (review.author && review.author.equals(req.user._id)))) {
        // Listing ke reviews array se review ko bahar nikalo aur review collection se delete karo
        await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
        await Review.findByIdAndDelete(reviewId);
        
        req.flash("success", "Review Deleted Successfully!");
    } else {
        req.flash("error", "You don't have permission to delete this review!");
    }

    res.redirect(`/listings/${id}`);
}));
// create route (CLEAN VERSION FOR SCHEMA MODIFIER & OWNER)
app.post("/listings", isLoggedIn, wrapAsync(async (req, res, next) => {
    // 1. Pure form ka data nikalna
    let { title, description, price, location, country, image } = req.body.listing;

    // 2. Naya Listing create karna
    const newListing = new Listing({ title, description, price, location, country });

    // 3. User ID ko owner field me map karna
    newListing.owner = req.user._id;

    // 4. Image handle karna (Schema set function khud handle kar lega default link)
    if (image && image.trim() !== "") {
        newListing.image = {
            filename: "listingimage",
            url: image.trim()
        };
    }

    await newListing.save();
    req.flash("success", "New Listing Created Successfully!"); 
    res.redirect("/listings");
}));
// Index Route (Saari listings dekhne ke liye)
app.get("/listings", wrapAsync(async (req, res) => {
  const allListing = await Listing.find({});
  res.render("lisitings/index.ejs", { allListing });
}));

// Edit Route (SECURED: Sirf Owner hi form dekh sakta hai)
// 1. Edit Listing Route (Form dikhane ke liye)
app.get("/listings/:id/edit", isLoggedIn, wrapAsync(async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findById(id.trim());
    
    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }

    // ADMIN BYPASS + SAFE OWNER CHECK
    if (req.user && (req.user.username === 'abhiadmin' || (listing.owner && listing.owner.equals(req.user._id)))) {
        res.render("lisitings/edit.ejs", { listing });
    } else {
        req.flash("error", "You don't have permission to edit this listing!");
        res.redirect(`/listings/${id}`);
    }
}));

// 2. Update Listing Route (Database mein save karne ke liye)
app.put("/listings/:id", isLoggedIn, wrapAsync(async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findById(id.trim());

    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }

    // ADMIN BYPASS + SAFE OWNER CHECK
    if (req.user && (req.user.username === 'abhiadmin' || (listing.owner && listing.owner.equals(req.user._id)))) {
        let data = req.body.listing ? req.body.listing : req.body;
        await Listing.findByIdAndUpdate(id.trim(), { ...data });
        
        req.flash("success", "Listing Updated Successfully!");
        res.redirect(`/listings/${id}`);
    } else {
        req.flash("error", "You don't have permission to update this listing!");
        res.redirect(`/listings/${id}`);
    }
}));

// Update Route (SECURED: Sirf Owner hi update kar sakta hai)
app.put("/listings/:id", isLoggedIn, wrapAsync(async (req, res, next) => {
    let { id } = req.params;
    let listing = await Listing.findById(id.trim());
    
    if (!listing) {
        return res.status(404).send("Listing not found!");
    }
    // Check if current user is the owner
    if (!listing.owner.equals(res.locals.currUser._id)) {
        return res.status(403).send("You don't have permission to update this listing!");
    }

    let data = req.body.listing ? req.body.listing : req.body;
    let updateData = {
        title: data.title,
        description: data.description,
        price: data.price,
        location: data.location,
        country: data.country
    };

    if (data.image && data.image.trim() !== "") {
        updateData.image = {
            filename: "listingimage",
            url: data.image.trim()
        };
    }

    await Listing.findByIdAndUpdate(id.trim(), updateData);
    req.flash("success", "New Listing Update Successfully!"); 
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
app.post("/login",
    passport.authenticate("local", {
        failureRedirect: "/login",
        failureMessage: true
    }),
    async (req, res) => {
        // Is line ko humne /listings se badal kar /profile kiya hai
        res.redirect("/profile");
    }
);

// NAYA ROUTE: Isko logout route ke upar ya niche kahi bhi paste kar do
app.get("/profile", async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    try {
        // Logged-in user ki properties fetch karna
        const myListings = await Listing.find({ owner: req.user._id });
        res.render("users/profile.ejs", { user: req.user, myListings });
    } catch (err) {
        console.log("Profile Error:", err);
        res.redirect("/listings");
    }
});
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
// Delete Route (SECURED: Sirf Owner hi delete kar sakta hai)
// Delete Route (SECURED: Admin bypass aur safe undefined check ke sath)
app.delete("/listings/:id", isLoggedIn, wrapAsync(async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findById(id.trim());

    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }

    // SAFE CHECK: Agar current user abhiadmin hai, ya listing ka owner aur logged-in user same hain
    if (req.user && (req.user.username === 'abhiadmin' || (listing.owner && listing.owner.equals(req.user._id)))) {
        await Listing.findByIdAndDelete(id.trim());
        req.flash("success", "Listing Deleted Successfully!");
    } else {
        req.flash("error", "You don't have permission to delete this listing!");
    }

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
