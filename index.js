require('dotenv').config();
const cors = require('cors');
const express = require('express')
const app = express()
const port = 5000
const { MongoClient, ServerApiVersion } = require('mongodb');
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!')
})




const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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