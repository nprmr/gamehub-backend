import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// 👇 MIME для wasm
app.use((req, res, next) => {
    if (req.url.endsWith(".wasm")) {
        res.type("application/wasm");
    }
    next();
});

// ✅ Раздача статических файлов (riv, wasm, картинки и т.д.)
app.use(express.static(path.join(__dirname, "public")));

// путь к JSON
const categoriesPath = path.join(__dirname, "data", "categories.json");

const loadCategories = () =>
    JSON.parse(fs.readFileSync(categoriesPath, "utf-8"));
const saveCategories = (data) =>
    fs.writeFileSync(categoriesPath, JSON.stringify(data, null, 2), "utf-8");

// ================== HELPERS ==================
const makeFullUrl = (req, riveFile) => {
    if (!riveFile) return null;
    return `${req.protocol}://${req.get("host")}${
        riveFile.startsWith("/") ? riveFile : "/rive/" + riveFile
    }`;
};

// ========== ПУБЛИЧНЫЕ ЭНДПОИНТЫ ==========

// 📌 список категорий (только метаданные)
app.get("/api/categories", (req, res) => {
    try {
        const categories = loadCategories();
        const brief = categories.map(({ title, riveFile, stateMachine, locked, adult }) => ({
            title,
            riveFile: makeFullUrl(req, riveFile),
            stateMachine: stateMachine || null,   // 🔹 теперь есть
            locked: locked ?? false,
            adult: adult ?? false,
        }));
        res.json(brief);
    } catch (err) {
        console.error("Ошибка чтения категорий:", err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// 📌 вопросы по одной категории
app.get("/api/questions", (req, res) => {
    try {
        const { category } = req.query;
        if (!category)
            return res.status(400).json({ error: "Category param required" });

        const categories = loadCategories();
        const cat = categories.find((c) => c.title === category);

        if (!cat) return res.status(404).json({ error: "Category not found" });

        const questions = (cat.questions ?? []).map((text) => ({
            text,
            category: cat.title,
            riveFile: makeFullUrl(req, cat.riveFile),
            stateMachine: cat.stateMachine || null,
        }));

        res.json(questions);
    } catch (err) {
        console.error("Ошибка получения вопросов:", err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// 📌 вопросы по нескольким категориям
app.get("/api/questions/multi", (req, res) => {
    try {
        const { categories: catsParam } = req.query;
        if (!catsParam)
            return res.status(400).json({ error: "Categories param required" });

        const names = catsParam.split(",").map((s) => s.trim()).filter(Boolean);
        const categories = loadCategories();

        const list = names.flatMap((name) => {
            const cat = categories.find((c) => c.title === name);
            return cat
                ? cat.questions.map((text) => ({
                    text,
                    category: cat.title,
                    riveFile: makeFullUrl(req, cat.riveFile),
                    stateMachine: cat.stateMachine || null,
                }))
                : [];
        });

        res.json(list);
    } catch (err) {
        console.error("Ошибка multi-вопросов:", err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// ========== АДМИНСКИЕ ЭНДПОИНТЫ ==========

// 📌 полный список категорий
app.get("/api/admin/categories", (req, res) => {
    try {
        const categories = loadCategories().map((c) => ({
            ...c,
            riveFile: makeFullUrl(req, c.riveFile),
        }));
        res.json(categories);
    } catch (err) {
        console.error("Ошибка чтения категорий:", err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// 📌 создать категорию
app.post("/api/admin/categories", (req, res) => {
    try {
        const categories = loadCategories();
        const newCategory = {
            title: req.body.title,
            riveFile: req.body.riveFile || "/rive/fire.riv",
            stateMachine: req.body.stateMachine || "State Machine 1", // 🔹 по умолчанию
            locked: req.body.locked ?? false,
            adult: req.body.adult ?? false,
            questions: req.body.questions ?? [],
        };
        categories.push(newCategory);
        saveCategories(categories);
        res.json({
            ...newCategory,
            riveFile: makeFullUrl(req, newCategory.riveFile),
        });
    } catch (err) {
        console.error("Ошибка добавления категории:", err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// 📌 обновить категорию
app.put("/api/admin/categories/:title", (req, res) => {
    try {
        const { title } = req.params;
        const updated = req.body;

        const categories = loadCategories();
        const index = categories.findIndex((c) => c.title === title);

        if (index === -1)
            return res.status(404).json({ error: "Category not found" });

        categories[index] = { ...categories[index], ...updated };
        saveCategories(categories);

        res.json({
            ...categories[index],
            riveFile: makeFullUrl(req, categories[index].riveFile),
        });
    } catch (err) {
        console.error("Ошибка обновления категории:", err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// 📌 удалить категорию
app.delete("/api/admin/categories/:title", (req, res) => {
    try {
        const { title } = req.params;
        let categories = loadCategories();

        const newCategories = categories.filter((c) => c.title !== title);

        if (newCategories.length === categories.length) {
            return res.status(404).json({ error: "Category not found" });
        }

        saveCategories(newCategories);

        res.json({ success: true });
    } catch (err) {
        console.error("Ошибка удаления категории:", err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// запуск
app.listen(PORT, () => {
    console.log(`✅ API running at http://localhost:${PORT}`);
});
