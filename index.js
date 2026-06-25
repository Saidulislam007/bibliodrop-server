require('dotenv').config();
const cors = require('cors');
const express = require('express')
const app = express()
const port = 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
app.use(cors({
  origin: [
     // লোকাল হোস্টে কাজ করার জন্য
    process.env.FRONTEND_URL // Vercel-এর লাইভ ফ্রন্টএন্ডের জন্য
  ], 
  credentials: true, 
  optionsSuccessStatus: 200
}));
app.use(express.json());
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
// 🟢 এক্সপ্রেস মিডলওয়্যার রেজিস্ট্রি
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send('Hello World!')
})

const uri = process.env.MONGODB_URI;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// async function run() {
//   try {
//     // Connect the client to the server	(optional starting in v4.7)
//     await client.connect();
    client.connect(()=>{
      console.log('connecting to mongo db')
    }).catch(console.dir);

    const database = client.db("bibliodrop");
    const booksCollection = database.collection("books");
    const usersCollection = database.collection("user");
    const wishlistCollection = database.collection("wishlists");
    const deliveriesCollection = database.collection("deliveries");
    const reviewsCollection = database.collection("reviews");


    app.get('/users', async (req, res) => {
      try {
        // ইউআরএল কোয়েরি প্যারামিটার থেকে ইমেইল বা রোল ফিল্টারিং সাপোর্ট
        const { email, role } = req.query;

        let query = {};

        if (email) {
          query.email = email;
        }
        if (role) {
          query.role = role;
        }

        // ডাটাবেজ থেকে ডেটা খোঁজা এবং অ্যারেতে কনভার্ট করা
        const result = await usersCollection.find(query).toArray();
        res.status(200).send(result);

      } catch (error) {
        console.error("Error fetching users from database:", error);
        res.status(500).send({ success: false, message: "Internal server error" });
      }
    });


    // 🟢 আপনার এক্সপ্রেস সার্ভার ফাইলে এটি চেক করুন:
    app.delete('/users/:id', async (req, res) => { // ⚠️ নিশ্চিত করুন এখানে 'users' লেখা (user নয়)
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await usersCollection.deleteOne(query);
        res.send({ success: true, ...result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


    app.patch('/users/:id/role', async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body; // ফ্রন্টএন্ড থেকে পাঠানো নতুন রোলটি রিসিভ করা হলো

        // ১. মঙ্গোডিবি আইডি ফরম্যাট ভ্যালিডেশন চেক
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid User ID format." });
        }

        // ২. সিকিউরিটির জন্য রোল চেক (যাতে কেউ উল্টাপাল্টা রোল পুশ না করতে পারে)
        const allowedRoles = ["user", "admin", "librarian"];
        if (!allowedRoles.includes(role)) {
          return res.status(400).json({ success: false, message: "Invalid role type specified." });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role: role } // 🔄 শুধুমাত্র রোল ফিল্ডটি আপডেট হবে
        };

        // ৩. মঙ্গোডিবিতে আপডেট কুয়েরি এক্সিকিউট করা
        const result = await usersCollection.updateOne(query, updateDoc);

        if (result.modifiedCount === 1 || result.matchedCount === 1) {
          res.status(200).json({
            success: true,
            message: "User role updated successfully.",
            modifiedCount: result.modifiedCount
          });
        } else {
          res.status(404).json({ success: false, message: "User not found or role unchanged." });
        }
      } catch (error) {
        console.error("Error in PATCH /users/:id/role:", error);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
      }
    });

    app.post('/books', async (req, res) => {
      const book = req.body;
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });

    // Express Backend: Pagination Route
app.get('/api/books', async (req, res) => {
  try {
    // ফ্রন্টএন্ড থেকে পাঠানো প্যারামিটার রিসিভ করা হলো ভাই
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const search = req.query.search || "";
    const category = req.query.category || "All";
    
    const skip = (page - 1) * limit;

    // ⚙️ ডাইনামিক কুয়েরি অবজেক্ট
    let query = { status: "Published" }; // শুধুমাত্র পাবলিশড বই সবসময় আসবে

    // যদি ফ্রন্টএন্ড থেকে সার্চ কি-ওয়ার্ড আসে
    if (search) {
      query.title = { $regex: search, $options: "i" }; // Case-insensitive সার্চ
    }

    // যদি নির্দিষ্ট কোনো ক্যাটাগরি সিলেক্ট করা থাকে
    if (category && category !== "All") {
      query.category = category;
    }

    // ১. ফিল্টার করা কুয়েরি অনুযায়ী টোটাল বুক কাউন্ট
    const totalBooks = await booksCollection.countDocuments(query);

    // ২. নির্দিষ্ট পেজের ডাটা স্কিপ ও লিমিট করে তুলে আনা
    const books = await booksCollection.find(query)
                                       .skip(skip)
                                       .limit(limit)
                                       .toArray();

    res.status(200).json({
      success: true,
      books,
      totalBooks,
      totalPages: Math.ceil(totalBooks / limit),
      currentPage: page
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


    // 🟢 আপনার এক্সপ্রেস ব্যাকএন্ডের রাউট স্ট্রাকচার এমন হওয়া উচিত:
    app.patch('/books/:id', async (req, res) => {
      try {
        const bookId = req.params.id;
        const updateData = req.body;

        // আপনার মঙ্গোডিবি আপডেট লজিক এখানে...
        const result = await booksCollection.updateOne(
          { _id: new ObjectId(bookId) },
          { $set: updateData }
        );

        // 🛡️ অবশই JSON রেসপন্স রিটার্ন করতে হবে, কোনো HTML বা ডিরেক্ট স্ট্রিং নয়!
        res.status(200).json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });


    app.delete('/books/:id', async (req, res) => {
      try {
        const id = req.params.id;

        // ১. মঙ্গোডিবির ObjectId ফরম্যাট চেক (ভুল বা ইনভ্যালিড আইডি হ্যান্ডেল করার জন্য)
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid Book ID format."
          });
        }

        // ২. নির্দিষ্ট আইডির বইটিকে খোঁজার কোয়েরি
        const query = { _id: new ObjectId(id) };

        // ৩. মঙ্গোডিবি ডিলিট অপারেশন রান করা (booksCollection এর জায়গায় আপনার কালেকশন ভ্যারিয়েবল নাম দিন)
        const result = await booksCollection.deleteOne(query);

        // ৪. যদি সত্যিই ডাটা ডিলিট হয় (deletedCount ১ বা তার বেশি হলে)
        if (result.deletedCount === 1) {
          res.status(200).json({
            success: true,
            message: "Book successfully deleted from database.",
            deletedCount: result.deletedCount
          });
        } else {
          // যদি এই আইডির কোনো বই ডাটাবেজে খুঁজে না পাওয়া যায়
          res.status(404).json({
            success: false,
            message: "No book asset found with this ID."
          });
        }

      } catch (error) {
        console.error("Express Error in DELETE /books/:id:", error);
        res.status(500).json({
          success: false,
          message: "Internal Server Error: " + error.message
        });
      }
    });

    // 💖 ✅ উইশলিস্টে ডাটা অ্যাড করার জন্য পারফেক্ট POST মেথড
    app.post('/wishlist', async (req, res) => {
      try {
        const wishlistData = req.body;

        // ১. মঙ্গোডিবির আইডি ভ্যালিডেশন সেফটি চেক
        if (!wishlistData.userId || !wishlistData.bookId) {
          return res.status(400).json({ success: false, message: "Missing required identifier fields." });
        }

        // ২. ডুপ্লিকেট এন্ট্রি আটকানো (একই ইউজার একই বই যাতে ২ বার অ্যাড না করতে পারে)
        const isAlreadyExist = await wishlistCollection.findOne({
          userId: wishlistData.userId,
          bookId: wishlistData.bookId
        });

        if (isAlreadyExist) {
          return res.status(400).json({
            success: false,
            message: "This library asset is already in your wishlist mesh!"
          });
        }

        // ৩. আপনার উইশলিস্ট কালেকশনে সম্পূর্ণ ডাটা ডকুমেন্ট পুশ করা
        const result = await wishlistCollection.insertOne(wishlistData);

        // 🟢 আপনার ফ্রন্টএন্ড কন্ডিশনের সাথে রেসপন্স ম্যাচ করে রিটার্ন করা হলো ভাই
        res.status(201).json({
          success: true,
          insertedId: result.insertedId
        });

      } catch (error) {
        console.error("Express Error in POST /wishlist:", error);
        res.status(500).json({
          success: false,
          message: "Internal Server Registry Collapse: " + error.message
        });
      }
    });

    // 🔍 ইউজারভিত্তিক উইশলিস্টের ডাটা গেট (GET) করার এপিআই রাউট
    app.get('/wishlist', async (req, res) => {
      try {
        // ফ্রন্টএন্ড থেকে কোয়েরি প্যারামিটার হিসেবে পাঠানো ইউজারের ইমেইলটি নেওয়া হলো
        const { email } = req.query;

        let query = {};

        // যদি ইমেইল পাঠানো হয়, তবে শুধুমাত্র সেই নির্দিষ্ট ইউজারের উইশলিস্ট ফিল্টার হবে
        if (email) {
          query.userEmail = email; // ফ্রন্টএন্ড থেকে আমরা 'userEmail' ফিল্ডে ডাটা পাঠিয়েছিলাম ভাই
        }

        // ডাটাবেজ থেকে ফিল্টার করা ডাটা খোঁজা এবং অ্যারেতে কনভার্ট করা
        const result = await wishlistCollection.find(query).toArray();

        // সফলভাবে ডাটা ক্লায়েন্ট সাইডে পাঠানো হচ্ছে
        res.status(200).send(result);

      } catch (error) {
        console.error("Express Error in GET /wishlist:", error);
        res.status(500).send({
          success: false,
          message: "Internal Server Error while fetching wishlist node assets."
        });
      }
    });

    // 🗑️ ডাটাবেজ থেকে নির্দিষ্ট উইশলিস্টের আইটেম ডিলিট করার API
    // 🟢 ১০০% সঠিক এবং ফিক্সড কোড:
    app.delete('/wishlist/:id', async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid Wishlist ID format." });
        }

        const query = { _id: new ObjectId(id) };
        const result = await wishlistCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          res.status(200).json({ success: true, message: "Asset removed from wishlist database." });
        } else {
          res.status(404).json({ success: false, message: "Wishlist item not found." });
        }
      } catch (error) {
        console.error("Express Error in DELETE /wishlist/:id:", error);
        res.status(500).json({ success: false, message: "Internal Server Error: " + error.message });
      }
    });

    app.post('/deliveries', async (req, res) => {
      try {
        const deliveryData = req.body;

        // সেফটি ভ্যালিডেশন চেক
        if (!deliveryData.userId || !deliveryData.bookId) {
          return res.status(400).json({ success: false, message: "Missing core identifiers." });
        }

        // [🧠 অপশনাল চেক] একই ইউজার অলরেডি এই বইটির জন্য রিকোয়েস্ট পেন্ডিং রেখেছে কিনা
        const isAlreadyRequested = await deliveriesCollection.findOne({
          userId: deliveryData.userId,
          bookId: deliveryData.bookId,
          deliveryStatus: "Pending" // শুধুমাত্র পেন্ডিং রিকোয়েস্ট ট্র্যাক করার জন্য
        });

        if (isAlreadyRequested) {
          return res.status(400).json({
            success: false,
            message: "You already have a pending delivery request for this book!"
          });
        }

        // ডেলিভারি কালেকশনে সম্পূর্ণ ডাটা পুশ করা হলো
        const result = await deliveriesCollection.insertOne(deliveryData);

        res.status(201).json({
          success: true,
          insertedId: result.insertedId
        });

      } catch (error) {
        console.error("Express Error in POST /deliveries:", error);
        res.status(500).json({ success: false, message: "Server Error: " + error.message });
      }
    });

    // 🔍 ইউজারভিত্তিক ডেলিভারি লিস্ট গেট করার এক্সপ্রেস রাউট
    app.get('/deliveries', async (req, res) => {
      try {
        const { email } = req.query;
        let query = {};

        if (email) {
          query.userEmail = email; // কারেন্ট ইউজারের ইমেইল ফিল্টার
        }

        const result = await deliveriesCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Express Error in GET /deliveries:", error);
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // 🔄 ডাটাবেজে নির্দিষ্ট ডেলিভারি রিকোয়েস্টের স্ট্যাটাস আপডেট করার PATCH রাউট
    app.patch('/deliveries/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { deliveryStatus } = req.body; // ফ্রন্টঅ্যান্ড থেকে পাঠানো নতুন স্ট্যাটাস

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid Delivery ID format." });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { deliveryStatus: deliveryStatus } // 🔄 শুধুমাত্র deliveryStatus ফিল্ডটি ডাটাবেজে আপডেট হবে
        };

        const result = await deliveriesCollection.updateOne(query, updateDoc);

        if (result.modifiedCount === 1 || result.matchedCount === 1) {
          res.status(200).json({ success: true, message: `Status updated to ${deliveryStatus}` });
        } else {
          res.status(404).json({ success: false, message: "Delivery record not found or unchanged." });
        }
      } catch (error) {
        console.error("Express Error in PATCH /deliveries/:id:", error);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
      }
    });

    app.post('/reviews', async (req, res) => {
      try {
        const reviewData = req.body;

        // ১. মঙ্গোডিবির রিকোয়ার্ড আইডি ও কমেন্ট ভ্যালিডেশন সেফটি চেক ভাই
        if (!reviewData.userId || !reviewData.bookId || !reviewData.comment?.trim()) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields: userId, bookId, or textual commentary."
          });
        }

        // ২. ডুপ্লিকেট এন্ট্রি আটকানো (একই ইউজার একই বইয়ের জন্য যাতে ২ বার রিভিউ কালেকশনে ডেটা পুশ না করতে পারে)
        const isAlreadyReviewed = await reviewsCollection.findOne({
          userId: reviewData.userId,
          bookId: reviewData.bookId
        });

        if (isAlreadyReviewed) {
          return res.status(400).json({
            success: false,
            message: "You have already submitted a commentary asset for this catalog entry!"
          });
        }

        // 📦 ৩. মঙ্গোডিবি স্কিমা অনুযায়ী অবজেক্ট ডাটা প্রিপারেশন
        const finalReviewPayload = {
          bookId: reviewData.bookId,
          deliveryId: reviewData.deliveryId || reviewData._id, // অরিজিনাল ডেলিভারি ডকুমেন্টের ট্র্যাকিং আইডি
          title: reviewData.title,
          author: reviewData.author,
          image: reviewData.image,
          category: reviewData.category,

          // 👤 ইউজার আইডেন্টিটি
          userId: reviewData.userId,
          userEmail: reviewData.userEmail,
          userName: reviewData.userName,

          // ✍️ কমেন্ট ও রেটিং
          comment: reviewData.comment.trim(),
          rating: Number(reviewData.rating) || 5, // ডিফল্ট ৫ স্টার যদি ফ্রন্টএন্ড থেকে না আসে ভাই
          createdAt: new Date().toISOString() // টাইমস্ট্যাম্প ট্র্যাকিং
        };

        // 🚀 ৪. আপনার টার্গেটেড 'reviews' কালেকশনে ডকুমেন্ট পুশ করা ভাই
        const result = await reviewsCollection.insertOne(finalReviewPayload);

        // 🟢 ফ্রন্টএন্ড কন্ডিশনের সাথে মিলিয়ে সাকসেস রেসপন্স রিটার্ন
        res.status(201).json({
          success: true,
          insertedId: result.insertedId
        });

      } catch (error) {
        console.error("Express Error in POST /reviews:", error);
        res.status(500).json({
          success: false,
          message: "Internal Server Review Pipeline Collapse: " + error.message
        });
      }
    });

    // const { ObjectId } = require('mongodb'); // 👈 ফাইলের শুরুতে ObjectId ইম্পোর্ট করা না থাকলে এটি নিশ্চিত করে নিবেন ভাই

// ==========================================
// ✏️ ১. REVIEW EDIT/UPDATE METHOD (PUT)
// ==========================================
app.put('/reviews/:id', async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { comment, rating } = req.body;

    // আইডি ভ্যালিডেশন চেক ভাই
    if (!ObjectId.isValid(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Review ID format."
      });
    }

    // মিনিমাম ভ্যালিডেশন সেফটি চেক
    if (!comment?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment text cannot be empty during modification."
      });
    }

    // মঙ্গোডিবির জন্য আপডেটেড ডক রেডি করা ভাই
    const updatedPayload = {
      $set: {
        comment: comment.trim(),
        rating: Number(rating) || 5,
        updatedAt: new Date().toISOString() // কখন আপডেট হলো তার টাইমস্ট্যাম্প
      }
    };

    const filter = { _id: new ObjectId(reviewId) };
    const result = await reviewsCollection.updateOne(filter, updatedPayload);

    // চেক করা হলো ডকুমেন্টটি ডাটাবেজে ম্যাচ করে মডিফাই হয়েছে কিনা ভাই
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Target review asset not found in database registry."
      });
    }

    res.status(200).json({
      success: true,
      message: "Review updated successfully.",
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error("Express Error in PUT /reviews:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Update Pipeline Collapse: " + error.message
    });
  }
});


// ==========================================
// 🗑️ ২. REVIEW DELETE METHOD (DELETE)
// ==========================================
app.delete('/reviews/:id', async (req, res) => {
  try {
    const reviewId = req.params.id;

    // আইডি ভ্যালিডেশন চেক ভাই
    if (!ObjectId.isValid(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Review ID format."
      });
    }

    const filter = { _id: new ObjectId(reviewId) };
    const result = await reviewsCollection.deleteOne(filter);

    // চেক করা হলো ডিলিট কাউন্ট ১ বা তার বেশি কিনা
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Review not found or already wiped from database core grid."
      });
    }

    // ফ্রন্টএন্ড কন্ডিশনের (result.success) সাথে মিলিয়ে সাকসেস রেসপন্স রিটার্ন ভাই
    res.status(200).json({
      success: true,
      message: "Review successfully wiped from database.",
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error("Express Error in DELETE /reviews:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Deletion Pipeline Collapse: " + error.message
    });
  }
});

    app.get('/reviews', async (req, res) => {
  try {
    // 🎯 কালেকশনের সব ডাটা কোনো কন্ডিশন ছাড়াই অ্যারে আকারে নিয়ে আসা হলো ভাই
    const result = await reviewsCollection.find().toArray();
    
    // সরাসরি সম্পূর্ণ ডাটা রেসপন্স হিসেবে রিটার্ন
    res.status(200).json(result);
  } catch (error) {
    console.error("Express Error in GET /reviews:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Review Fetch Collapse: " + error.message 
    });
  }
});

const verifyJWT = (req, res, next) => {
  try {
    // 💡 আপনার ফ্রন্টএন্ড যে নামে কুকি সেভ করে (যেমন: 'token') সেটি এখান থেকে রিড হবে ভাই
    const token = req.cookies?.token;

    // টোকেন না থাকলে সরাসরি এক্সেস ডিনাইড ভাই
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "🔒 Access Unauthorized: Token payload missing in registry."
      });
    }

    // টোকেন ভেরিফিকেশন হ্যান্ডশেক
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: "🚫 Forbidden: Invalid or expired encryption token."
        });
      }

      // 👤 ভেরিফাইড ইউজারের ডেটা (যেমন: email, id) রিকোয়েস্ট অবজেক্টে পুশ করা হলো
      req.user = decoded; 
      
      next(); // সব ঠিক থাকলে পরবর্তী এক্সিকিউশন নোডে পাস করে দেবে ভাই
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Auth Node Collapse: " + error.message });
  }
};

app.get('/deliveries', verifyJWT, async (req, res) => {
  try {
    // 💡 ম্যাজিক: টোকেন ডিকোড হয়ে req.user এর ভেতর এখন লগইন থাকা ইউজারের ইমেইল বা আইডি লাইভ আছে ভাই!
    const loggedInUserEmail = req.user.email; 
    const emailQuery = req.query.email;

    let query = {};
    if (emailQuery && emailQuery.trim() !== "") {
      query = { userEmail: emailQuery };
    }

    const result = await deliveriesCollection.find(query).toArray();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/reviews/:id', verifyJWT, async (req, res) => {
  try {
    const reviewId = req.params.id;
    
    // সিকিউরিটি চেক: আপনি চাইলে req.user.id দিয়েও চেক করতে পারেন যে এই ইউজার তার নিজের রিভিউই ডিলিট করছে কিনা ভাই!
    const filter = { _id: new ObjectId(reviewId) };
    const result = await reviewsCollection.deleteOne(filter);
    
    res.status(200).json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
//     console.log("Pinged your deployment. You successfully connected to MongoDB!");
//   } finally {
//     // Ensures that the client will close when you finish/error
//     // await client.close();
//   }
// }
// run().catch(console.dir);





app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

module.exports =app;