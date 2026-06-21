require('dotenv').config();
const cors = require('cors');
const express = require('express')
const app = express()
const port = 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
app.use(cors());
app.use(express.json());

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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("bibliodrop");
    const booksCollection = database.collection("books");
    const usersCollection = database.collection("user");


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

    app.post('/books', async (req, res) => {
      const book = req.body;
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });

    app.get('/books', async (req, res) => {
      try {
        // URL theke query parameters nilam (category ar author diye query korar jonno)
        const { category, author } = req.query;

        let query = {};

        // database-e "category" name column ache, tai ekhane category check korlam
        if (category) {
          query.category = category;
        }
        if (author) {
          query.author = author;
        }

        const result = await booksCollection.find(query).toArray();
        res.send(result);

      } catch (error) {
        console.error("Error fetching books:", error);
        res.status(500).send({ message: "Internal server error" });
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


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);





app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})