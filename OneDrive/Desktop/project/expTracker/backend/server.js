import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
dotenv.config();

const app = express();
const POSTGREST_URL = process.env.POSTGREST_URL;

app.use(bodyParser.json());
app.use(cors());

const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "frontend")));

app.get("/expenses", async (req, res) => {
  console.log("Fetching expenses from PostgREST...");
  const response = await axios.get(`${POSTGREST_URL}/expenses`);
  console.log("PostgREST response:", response.data);
  res.status(200).json(response.data);
});

app.post("/expenses", async (req, res) => {
  console.log("Received POST request with body:", req.body);
  const { item_name, amount } = req.body;
  console.log("Parsed expense data:", { item_name, amount });

  const response = await axios.post(`${POSTGREST_URL}/expenses`, {
    item_name,
    amount,
  });
  console.log("PostgREST response:", response.data);

  res.status(201).json(response.data);
});

app.delete("/expenses/:id", async (req, res) => {
  const { id } = req.params;
  const response = await axios.delete(`${POSTGREST_URL}/expenses?id=eq.${id}`);
  res.status(200).json({ message: "Expense was deleted!!!" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.listen(3000, () => {
  console.log("server is running on port 3000");
});
