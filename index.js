require('dotenv').config();
const express = require('express');
const cors = require('cors'); // 🟢 এখানে একবারই ডিক্লেয়ার করা হলো
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000; 

const allowedOrigins = ['http://localhost:3000'];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS','PATCH'],
  // 🟢 এখানে 'x-user-email' কাস্টম হেডারটি এলাউ করে দেওয়া হলো
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-email'] 
}));

// এক্সপ্রেস বডি পার্সার ও কুকি পার্সার মিডলওয়্যার
app.use(express.json());
app.use(cookieParser());

// 🟢 JWT ভেরিফিকেশন মিডলওয়্যার
// 📄 আপনার ব্যাকএন্ড সার্ভারের (index.js) verifyJWT ফাংশনটি এভাবে আপডেট করুন ভাই
// const verifyJWT = (req, res, next) => {
//   try {
//     // 🟢 Better-Auth এর কুকি নাম অথবা Authorization হেডার থেকে টোকেনটি রিড করবে
//     const token = req.cookies?.["__Secure-better-auth.session_token"] || 
//                   req.cookies?.token || 
//                   req.headers.authorization?.split(' ')[1];

//     // ডিবাগ করার জন্য সার্ভার কনসোলে চেক করুন টোকেন পাচ্ছে কিনা
//     console.log("Received Token in Backend:", token ? "Found ✅" : "Missing ❌");

//     if (!token) {
//       return res.status(401).json({
//         success: false,
//         message: "🔒 Access Unauthorized: Token payload missing in registry."
//       });
//     }

//     // ⚠️ Better-Auth যদি নিজস্ব এনক্রিপশন ব্যবহার করে, তবে সরাসরি jwt.verify কাজ নাও করতে পারে।
//     // কিন্তু যদি আপনি ম্যানুয়ালি সাইন করা JWT এই কুকিতে রাখেন, তবে নিচের কোড ঠিক আছে:
//     jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//       if (err) {
//         return res.status(403).json({
//           success: false,
//           message: "🚫 Forbidden: Invalid or expired encryption token."
//         });
//       }

//       req.user = decoded; 
//       next(); 
//     });

//   } catch (error) {
//     res.status(500).json({ success: false, message: "Internal Auth Node Collapse: " + error.message });
//   }
// };

app.get('/', (req, res) => {
  res.send('Hello World!')
});

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const database = client.db("bibliodrop");
    const booksCollection = database.collection("books");
    const usersCollection = database.collection("user"); 
    const wishlistCollection = database.collection("wishlists");
    const deliveriesCollection = database.collection("deliveries");
    const reviewsCollection = database.collection("reviews");

    // ==========================================
    // 👤 USER ROUTES
    // ==========================================
    app.get('/users', async (req, res) => {
      try {
        const { email, role } = req.query;
        let query = {};

        if (email) query.email = email;
        if (role) query.role = role;

        const result = await usersCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching users from database:", error);
        res.status(500).send({ success: false, message: "Internal server error" });
      }
    });

    app.delete('/users/:id', async (req, res) => {
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
        const { role } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid User ID format." });
        }

        const allowedRoles = ["user", "admin", "librarian"];
        if (!allowedRoles.includes(role)) {
          return res.status(400).json({ success: false, message: "Invalid role type specified." });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = { $set: { role: role } };

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

    // ==========================================
    // 📚 BOOK ROUTES
    // ==========================================
    app.post('/books', async (req, res) => {
      const book = req.body;
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });

    app.get('/books', async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;
        const query = { status: "Published" };

        const totalBooks = await booksCollection.countDocuments(query);
        const books = await booksCollection.find(query).skip(skip).limit(limit).toArray();

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

    app.patch('/books/:id', async (req, res) => {
      try {
        const bookId = req.params.id;
        const updateData = req.body;

        const result = await booksCollection.updateOne(
          { _id: new ObjectId(bookId) },
          { $set: updateData }
        );
        res.status(200).json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.delete('/books/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid Book ID format." });
        }

        const query = { _id: new ObjectId(id) };
        const result = await booksCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          res.status(200).json({ success: true, message: "Book successfully deleted." });
        } else {
          res.status(404).json({ success: false, message: "No book asset found with this ID." });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // 💖 WISHLIST ROUTES
    // ==========================================
    app.post('/wishlist', async (req, res) => {
      try {
        const wishlistData = req.body;
        if (!wishlistData.userId || !wishlistData.bookId) {
          return res.status(400).json({ success: false, message: "Missing required identifier fields." });
        }

        const isAlreadyExist = await wishlistCollection.findOne({
          userId: wishlistData.userId,
          bookId: wishlistData.bookId
        });

        if (isAlreadyExist) {
          return res.status(400).json({ success: false, message: "This library asset is already in your wishlist!" });
        }

        const result = await wishlistCollection.insertOne(wishlistData);
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get('/wishlist', async (req, res) => {
      try {
        const { email } = req.query;
        let query = {};
        if (email) query.userEmail = email;

        const result = await wishlistCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.delete('/wishlist/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid Wishlist ID format." });
        }

        const query = { _id: new ObjectId(id) };
        const result = await wishlistCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          res.status(200).json({ success: true, message: "Asset removed from wishlist." });
        } else {
          res.status(404).json({ success: false, message: "Wishlist item not found." });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // 📦 DELIVERY ROUTES (SECURED WITH JWT)
    // ==========================================
    app.post('/deliveries', async (req, res) => {
      try {
        const deliveryData = req.body;
        if (!deliveryData.userId || !deliveryData.bookId) {
          return res.status(400).json({ success: false, message: "Missing core identifiers." });
        }

        const isAlreadyRequested = await deliveriesCollection.findOne({
          userId: deliveryData.userId,
          bookId: deliveryData.bookId,
          deliveryStatus: "Pending"
        });

        if (isAlreadyRequested) {
          return res.status(400).json({ success: false, message: "You already have a pending delivery request!" });
        }

        const result = await deliveriesCollection.insertOne(deliveryData);
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // 📄 আপনার ব্যাকএন্ড সার্ভারের রাউটটি এভাবে মডিফাই করুন ভাই
app.get('/deliveries', async (req, res) => {
  try {
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

    app.patch('/deliveries/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { deliveryStatus } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid Delivery ID format." });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = { $set: { deliveryStatus: deliveryStatus } };

        const result = await deliveriesCollection.updateOne(query, updateDoc);

        if (result.modifiedCount === 1 || result.matchedCount === 1) {
          res.status(200).json({ success: true, message: `Status updated to ${deliveryStatus}` });
        } else {
          res.status(404).json({ success: false, message: "Delivery record not found or unchanged." });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // ✍️ REVIEW ROUTES
    // ==========================================
    app.post('/reviews', async (req, res) => {
      try {
        const reviewData = req.body;
        if (!reviewData.userId || !reviewData.bookId || !reviewData.comment?.trim()) {
          return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        const isAlreadyReviewed = await reviewsCollection.findOne({
          userId: reviewData.userId,
          bookId: reviewData.bookId
        });

        if (isAlreadyReviewed) {
          return res.status(400).json({ success: false, message: "You have already submitted a review!" });
        }

        const finalReviewPayload = {
          bookId: reviewData.bookId,
          deliveryId: reviewData.deliveryId || reviewData._id,
          title: reviewData.title,
          author: reviewData.author,
          image: reviewData.image,
          category: reviewData.category,
          userId: reviewData.userId,
          userEmail: reviewData.userEmail,
          userName: reviewData.userName,
          comment: reviewData.comment.trim(),
          rating: Number(reviewData.rating) || 5,
          createdAt: new Date().toISOString()
        };

        const result = await reviewsCollection.insertOne(finalReviewPayload);
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get('/reviews', async (req, res) => {
      try {
        const result = await reviewsCollection.find().toArray();
        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.put('/reviews/:id', async (req, res) => {
      try {
        const reviewId = req.params.id;
        const { comment, rating } = req.body;

        if (!ObjectId.isValid(reviewId)) {
          return res.status(400).json({ success: false, message: "Invalid Review ID format." });
        }

        if (!comment?.trim()) {
          return res.status(400).json({ success: false, message: "Comment text cannot be empty." });
        }

        const updatedPayload = {
          $set: {
            comment: comment.trim(),
            rating: Number(rating) || 5,
            updatedAt: new Date().toISOString()
          }
        };

        const filter = { _id: new ObjectId(reviewId) };
        const result = await reviewsCollection.updateOne(filter, updatedPayload);

        if (result.matchedCount === 0) {
          return res.status(404).json({ success: false, message: "Target review not found." });
        }

        res.status(200).json({ success: true, message: "Review updated successfully." });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.delete('/reviews/:id', async (req, res) => {
  try {
    const reviewId = req.params.id;

    if (!ObjectId.isValid(reviewId)) {
      return res.status(400).json({ success: false, message: "Invalid Review ID format." });
    }

    const filter = { _id: new ObjectId(reviewId) };
    const result = await reviewsCollection.deleteOne(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }

    // 🟢 ফ্রন্টএন্ডের সুবিধার জন্য success: true প্রপার্টিসহ রেসপন্স পাঠানো হচ্ছে
    res.status(200).json({ success: true, deletedCount: result.deletedCount });
    
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});