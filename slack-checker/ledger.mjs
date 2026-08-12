// Mongo I/O for the per-course Slack-post ledger: lottery_<course>.slack_posts
import mongodb from "mongodb";

const { MongoClient } = mongodb;
const url = process.env.MONGO_URL || "mongodb://localhost:27017";

function postsCollection(client, course) {
  return client.db("lottery_" + course).collection("slack_posts");
}

/**
 * Upsert a post by threadTs. addedAt is set only on first insert.
 * @param {string} course
 * @param {{threadTs:string,url:string,channel:string,text:string,source:string,
 *          awarded?:boolean,points?:number,studentCount?:number,awardedAt?:Date}} post
 */
export async function recordPost(course, post) {
  const client = new MongoClient(url, { useUnifiedTopology: true });
  try {
    await client.connect();
    await postsCollection(client, course).updateOne(
      { threadTs: post.threadTs },
      { $set: post, $setOnInsert: { addedAt: new Date() } },
      { upsert: true }
    );
  } finally {
    await client.close();
  }
}

/** Mark a recorded post as awarded with point/student totals. */
export async function markAwarded(course, threadTs, { points, studentCount }) {
  const client = new MongoClient(url, { useUnifiedTopology: true });
  try {
    await client.connect();
    await postsCollection(client, course).updateOne(
      { threadTs },
      { $set: { awarded: true, points, studentCount, awardedAt: new Date() } }
    );
  } finally {
    await client.close();
  }
}

/** True if a post exists and is marked awarded. */
export async function isAwarded(course, threadTs) {
  const client = new MongoClient(url, { useUnifiedTopology: true });
  try {
    await client.connect();
    const doc = await postsCollection(client, course).findOne({ threadTs });
    return !!(doc && doc.awarded);
  } finally {
    await client.close();
  }
}

/** All ledger docs for a course, newest first. */
export async function getPosts(course) {
  const client = new MongoClient(url, { useUnifiedTopology: true });
  try {
    await client.connect();
    return await postsCollection(client, course).find({}).sort({ addedAt: -1 }).toArray();
  } finally {
    await client.close();
  }
}

/** Only the awarded posts (used for participation totals). */
export async function getAwardedPosts(course) {
  const posts = await getPosts(course);
  return posts.filter((p) => p.awarded);
}

/** Reference texts for the future embeddings classifier (all confirmed offers). */
export async function getReferenceTexts(course) {
  const posts = await getPosts(course);
  return posts.map((p) => p.text).filter(Boolean);
}
