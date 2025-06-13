// ✅ Import dependencies
import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import axios from "axios";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

// ✅ Config
dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000; // changed from 5000 to 5001
// const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5175";
const allowedOrigins = [
  "https://creatiweta.com",
  "http://localhost:5175", // or whatever port Vite runs on
];

// ✅ __dirname workaround for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(bodyParser.json());

// ✅ Phone Validation Endpoint
app.post("/api/validate-phone", async (req: Request, res: Response) => {
  const { phone } = req.body;
  try {
    const response = await axios.get("https://api.veriphone.io/v2/verify", {
      params: { phone, key: process.env.VERIPHONE_API_KEY },
    });
    res.json({ valid: response.data.phone_valid });
  } catch (error) {
    res.status(500).json({ valid: false, message: "Phone validation failed" });
  }
});

// ✅ Email Validation Endpoint
app.post("/api/validate-email", async (req: Request, res: Response) => {
  const { email } = req.body;
  try {
    const response = await axios.get("https://emailvalidation.abstractapi.com/v1/", {
      params: {
        api_key: process.env.ABSTRACT_EMAIL_API_KEY,
        email,
      },
    });
    const isValid = response.data.deliverability === "DELIVERABLE" &&
                    response.data.is_valid_format?.value === true;
    res.json({ valid: isValid });
  } catch (error) {
    res.status(500).json({ valid: false, message: "Email validation failed" });
  }
});

// ✅ Contact Submission
app.post("/api/contact", async (req: Request, res: Response) => {
  const { name, email, phone, message } = req.body;

  console.log("[/api/contact] Incoming request body:", req.body);
  if (!name || !email || !phone || !message) {
    res.status(400).json({ success: false, message: "All fields are required" });
    return;
  }

  try {
    const phoneCheck = await axios.get("https://api.veriphone.io/v2/verify", {
      params: { phone, key: process.env.VERIPHONE_API_KEY },
    });

    if (!phoneCheck.data.phone_valid) {
      res.status(400).json({ success: false, message: "Invalid phone number" });
      return;
    }

    const emailCheck = await axios.get("https://emailvalidation.abstractapi.com/v1/", {
      params: { api_key: process.env.ABSTRACT_EMAIL_API_KEY, email },
    });

    const isEmailValid = emailCheck.data.deliverability === "DELIVERABLE" &&
                         emailCheck.data.is_valid_format?.value === true;

    if (!isEmailValid) {
      res.status(400).json({ success: false, message: "Invalid email address" });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Contact Submissions");
    sheet.columns = [
      { header: "Name", key: "name" },
      { header: "Email", key: "email" },
      { header: "Phone", key: "phone" },
      { header: "Message", key: "message" },
      { header: "Submitted At", key: "submittedAt" },
    ];
    sheet.addRow({
      name,
      email,
      phone,
      message,
      submittedAt: new Date().toLocaleString(),
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Creatiweta Contact" <${process.env.EMAIL_USER}>`,
      to: "contact.creatiwetastudios@gmail.com",
      subject: "New Contact Form Submission",
      html: `
        <h3>New Inquiry</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Message:</strong> ${message}</p>
      `,
      attachments: [
        {
          filename: "submission.xlsx",
          content: Buffer.from(buffer),
        },
      ],
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[/api/contact]", error.message || error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Serve frontend
const clientPath = path.join(__dirname, "dist");
app.use(express.static(clientPath));

app.get("/*", (req: Request, res: Response) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
