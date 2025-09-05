const express = require('express');
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require('multer');
const { Parser } = require("json2csv");

const upload = multer();
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Parses application/x-www-form-urlencoded bodies


// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);


// GET: Export leads or vehicles
app.get("/export/:type", async (req, res) => {
  try {
    const type = req.params.type;
    let table, columns;

    if (type === "vehicles") {
      table = "vehicle_stock";
      // skip image_urls here
      columns =
        "id, model, year, price, owner_type, name, mobile, status, description";
    } else if (type === "purchase-leads") {
      table = "purchase_leads";
      columns =
        "id, name, mobile, model, budget, loan_type, description, status";
    } else if (type === "insurance-leads") {
      table = "insurance_leads";
      columns = "id, name, mobile, vehicle_no, model, insurance_date, status";
    } else {
      return res.status(400).json({ error: "Invalid type" });
    }

    // Fetch from Supabase
    const { data, error } = await supabase.from(table).select(columns);
    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "No data to export" });
    }

    // Convert JSON → CSV
    const parser = new Parser();
    const csv = parser.parse(data);

    // Return file
    res.header("Content-Type", "text/csv");
    res.attachment(`${type}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error("CSV Export Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST: Create a new Purchase Lead
app.post("/leads/purchase", async (req, res) => {
  try {
    const { name, mobile, model, budget, loan_type, description } = req.body;

    const { data, error } = await supabase
      .from("purchase_leads")
      .insert([{ name, mobile, model, budget, loan_type, description }]);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/update/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;
    const { status } = req.body; // we can extend later

    let table;
    if (type === "vehicles") table = "vehicle_stock";
    else if (type === "purchase") table = "purchase_leads";
    else if (type === "insurance") table = "insurance_leads";
    else return res.status(400).json({ error: "Invalid type" });

    // update in supabase
    const { data, error } = await supabase
      .from(table)
      .update({ status })
      .eq("id", id)
      .select();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// GET: Fetch Purchase Leads with Filters
app.get("/purchase", async (req, res) => {
  try {
    let query = supabase.from("purchase_leads").select("*");

    // Optional filters
    if (req.query.budget) {
      query = query.gte("budget", Number(req.query.budget));
    }
    if (req.query.loan_type) {
      query = query.eq("loan_type", req.query.loan_type);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/purchase/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("purchase_leads")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ Route: Add Vehicle with up to 3 images
// Add Vehicle with up to 3 images
app.post("/vehicles", upload.array("images", 3), async (req, res) => {
  try {
    const { model, year, price, description, owner_type, name, mobile } =
      req.body;

    // ✅ Ensure owner_type is a plain string, not an array
    const cleanOwnerType = Array.isArray(owner_type) ? owner_type[0] : owner_type;

    let imageUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const fileName = `${Date.now()}-${file.originalname}`;

        const { error: uploadError } = await supabase.storage
          .from("vehicle-images")
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("vehicle-images").getPublicUrl(fileName);

        imageUrls.push(publicUrl);
      }
    }

    const { data, error } = await supabase.from("vehicle_stock").insert([
      {
        model,
        year: year ? Number(year) : null,
        price: price ? Number(price) : null,
        description,
        owner_type: cleanOwnerType, // ✅ sanitized
        name,
        mobile,
        image_urls: imageUrls,
      },
    ]);

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /vehicles
 * Returns list of vehicle_stock rows (latest first)
 */
app.get("/vehicles", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vehicle_stock")
      .select("*")
      .order("id", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("GET /vehicles error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});


/**
 * DELETE /vehicles/:id
 * - Removes DB row
 * - Attempts to remove images from Supabase storage (if any)
 */
app.delete("/vehicles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    // fetch the vehicle row
    const { data: row, error: fetchError } = await supabase
      .from("vehicle_stock")
      .select("image_urls")
      .eq("id", id)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") { // single returns error if not found
      console.warn("Fetch vehicle error:", fetchError);
      return res.status(404).json({ error: fetchError.message || "Not found" });
    }

    const imageUrls = row?.image_urls ?? [];

    // delete files from bucket (if present)
    const filesToRemove = imageUrls
      .map(url => {
        try {
          // extract filename from public URL path
          const pathname = new URL(url).pathname; // e.g. /storage/v1/object/public/vehicle-images/169...
          const parts = pathname.split("/");
          return decodeURIComponent(parts.pop());
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    if (filesToRemove.length) {
      const { error: removeError } = await supabase.storage.from("vehicle-images").remove(filesToRemove);
      if (removeError) console.warn("Storage remove error:", removeError);
    }

    // delete row
    const { error: deleteError } = await supabase.from("vehicle_stock").delete().eq("id", id);
    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /vehicles/:id error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// PUT /vehicles/:id
// Update vehicle
app.put("/vehicles/:id", async (req, res) => {
  try {
    const { model, year, price, description, owner_type, name, mobile, status } =
      req.body;

    // ✅ Ensure owner_type is plain string
    const cleanOwnerType = Array.isArray(owner_type) ? owner_type[0] : owner_type;

    const { data, error } = await supabase
      .from("vehicle_stock")
      .update({
        model,
        year: year ? Number(year) : null,
        price: price ? Number(price) : null,
        description,
        owner_type: cleanOwnerType, // ✅ sanitized
        name,
        mobile,
        status,
      })
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST: Add Insurance Lead
app.post("/leads/insurance", async (req, res) => {
  try {
    const { name, mobile, vehicle_no, model, insurance_date } = req.body;

    const { data, error } = await supabase
      .from("insurance_leads")
      .insert([{ name, mobile, vehicle_no, model, insurance_date }]);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Fetch Insurance Leads with Filters
app.get("/insurance", async (req, res) => {
  try {
    let query = supabase.from("insurance_leads").select("*");

    if (req.query.insurance_date)
      query = query.lte("insurance_date", req.query.insurance_date);

    if (req.query.model) query = query.ilike("model", `%${req.query.model}%`);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/insurance/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("insurance_leads")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
