var express = require("express");
var router = express.Router();
var path = require("path");
var multer = require("multer");
var mongoose = require("mongoose");

var messageModel = require("../schemas/messages");
var userModel = require("../schemas/users");
var { checkLogin } = require("../utils/authHandler");

var storageSetting = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    var ext = path.extname(file.originalname);
    var namefile = Date.now() + "-" + Math.round(Math.random() * 2e9) + ext;
    cb(null, namefile);
  },
});

var uploadFile = multer({
  storage: storageSetting,
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get("/", checkLogin, async function (req, res, next) {
  try {
    var currentUserId = new mongoose.Types.ObjectId(req.user._id);

    var latestMessages = await messageModel.aggregate([
      {
        $match: {
          $or: [{ from: currentUserId }, { to: currentUserId }],
        },
      },
      {
        $addFields: {
          partnerId: {
            $cond: [{ $eq: ["$from", currentUserId] }, "$to", "$from"],
          },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$partnerId",
          message: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$message" } },
      { $sort: { createdAt: -1 } },
    ]);

    res.send(latestMessages);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.get("/:userID", checkLogin, async function (req, res, next) {
  try {
    var currentUserId = req.user._id;
    var userID = req.params.userID;

    if (!mongoose.Types.ObjectId.isValid(userID)) {
      return res.status(400).send({ message: "userID khong hop le" });
    }

    var targetUser = await userModel.findOne({
      _id: userID,
      isDeleted: false,
    });

    if (!targetUser) {
      return res.status(404).send({ message: "user khong ton tai" });
    }

    var messages = await messageModel
      .find({
        $or: [
          { from: currentUserId, to: userID },
          { from: userID, to: currentUserId },
        ],
      })
      .sort({ createdAt: 1 });

    res.send(messages);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.post("/:userID", checkLogin, uploadFile.single("file"), async function (req, res, next) {
  try {
    var currentUserId = req.user._id;
    var userID = req.params.userID;

    if (!mongoose.Types.ObjectId.isValid(userID)) {
      return res.status(400).send({ message: "userID khong hop le" });
    }

    var targetUser = await userModel.findOne({
      _id: userID,
      isDeleted: false,
    });

    if (!targetUser) {
      return res.status(404).send({ message: "user khong ton tai" });
    }

    var messagePayload;

    if (req.file) {
      messagePayload = {
        type: "file",
        text: req.file.path,
      };
    } else {
      var text = (req.body.text || req.body?.messageContent?.text || "").trim();
      if (!text) {
        return res.status(400).send({ message: "noi dung text khong duoc rong" });
      }

      messagePayload = {
        type: "text",
        text: text,
      };
    }

    var newMessage = await messageModel.create({
      from: currentUserId,
      to: userID,
      messageContent: messagePayload,
    });

    return res.status(201).json(newMessage);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
