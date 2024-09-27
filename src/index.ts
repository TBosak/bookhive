import { Hono } from 'hono';
import books_1 from './data/books_1.json';
import books_2 from './data/books_2.json';
import books_3 from './data/books_3.json';
import books_4 from './data/books_4.json';
import books_5 from './data/books_5.json';
import books_6 from './data/books_6.json';
import ratings_1 from './data/ratings_1.json';
import ratings_2 from './data/ratings_2.json';
import ratings_3 from './data/ratings_3.json';
import ratings_4 from './data/ratings_4.json';
import ratings_5 from './data/ratings_5.json';
import ratings_6 from './data/ratings_6.json';

interface Book {
  ISBN: string;
  Title: string;
  Author: string;
  Year: number;
  Publisher: string;
  SmallImage: string;
  MedImage: string;
  LgImage: string;
}

interface Rating {
  UserID: string;
  ISBN: string;
  Rating: number;
}

const app = new Hono();

app.get('/book', async (ctx) => {
  const title = ctx.req.query('title');
  const books = [...books_1 as Book[], ...books_2 as Book[], ...books_3 as Book[], ...books_4 as Book[], ...books_5 as Book[], ...books_6 as Book[]].flat();
  const result = books.find((book) => book.Title === title);
  console.log(result);
  return ctx.json(result);
});

app.get('/recommend', async (ctx) => {
  // Accept lists of titles, authors, and years from the query parameters
  const titleList = ctx.req.queries('title') || [];
  const authorList = ctx.req.queries('author') || [];
  const yearList = ctx.req.queries('year') || [];

  if (titleList.length === 0 && authorList.length === 0 && yearList.length === 0) {
    return ctx.json({ error: "At least one 'title', 'author', or 'year' query parameter is required" }, 400);
  }

  const books = [...books_1 as Book[], ...books_2 as Book[], ...books_3 as Book[], ...books_4 as Book[], ...books_5 as Book[], ...books_6 as Book[]].flat();
  const ratings = [...ratings_1 as Rating[], ...ratings_2 as Rating[], ...ratings_3 as Rating[], ...ratings_4 as Rating[], ...ratings_5 as Rating[], ...ratings_6 as Rating[]].flat();

  // Build the target set of ISBNs based on the provided query parameters
  const targetISBNs = new Set<string>();

  // Map titles to ISBNs, handling case insensitivity
  if (titleList.length > 0) {
    const titleToISBNMap = new Map<string, string>();
    books.forEach((book) => {
      titleToISBNMap.set(book.Title.toLowerCase(), book.ISBN);
    });

    titleList.forEach((title: string) => {
      const isbn = titleToISBNMap.get(title.toLowerCase());
      if (isbn) {
        targetISBNs.add(isbn);
      } else {
        console.warn(`Title not found: ${title}`);
      }
    });
  }

  // Map authors to ISBNs
  if (authorList.length > 0) {
    const authorToISBNsMap = new Map<string, Set<string>>();
    books.forEach((book) => {
      const author = book.Author.toLowerCase();
      if (!authorToISBNsMap.has(author)) {
        authorToISBNsMap.set(author, new Set());
      }
      authorToISBNsMap.get(author)?.add(book.ISBN);
    });

    authorList.forEach((author: string) => {
      const isbns = authorToISBNsMap.get(author.toLowerCase());
      if (isbns) {
        isbns.forEach((isbn) => targetISBNs.add(isbn));
      } else {
        console.warn(`Author not found: ${author}`);
      }
    });
  }

  // Map years to ISBNs (considering the same decade)
  if (yearList.length > 0) {
    const targetDecades = yearList.map((yearStr: string) => {
      const year = parseInt(yearStr);
      return Math.floor(year / 10) * 10;
    });

    books.forEach((book) => {
      const bookDecade = Math.floor(book.Year / 10) * 10;
      if (targetDecades.includes(bookDecade)) {
        targetISBNs.add(book.ISBN);
      }
    });
  }

  if (targetISBNs.size === 0) {
    return ctx.json({ error: 'No valid books found based on the provided query parameters' }, 400);
  }

  // Build mapping from UserID to a Map of ISBNs and their ratings
  const userRatingsMap: { [key: string]: Map<string, number> } = {};

  ratings.forEach((rating) => {
    if (!userRatingsMap[rating.UserID]) {
      userRatingsMap[rating.UserID] = new Map();
    }
    userRatingsMap[rating.UserID].set(rating.ISBN, rating.Rating);
  });

  // Target set of books is the set of ISBNs collected from the query parameters
  const targetBooks = targetISBNs;

  // Compute Jaccard similarity between target books and each user's rated books
  const similarities: { userId: string; similarity: number }[] = [];

  for (const [userId, userRatings] of Object.entries(userRatingsMap)) {
    const userBooks = new Set(userRatings.keys());

    const intersectionSize = [...targetBooks].filter((isbn) => userBooks.has(isbn)).length;
    const unionSize = new Set([...targetBooks, ...userBooks]).size;

    const similarity = intersectionSize / unionSize;

    if (similarity > 0) {
      similarities.push({ userId, similarity });
    }
  }

  // Sort similarities in descending order
  similarities.sort((a, b) => b.similarity - a.similarity);

  // Get top N similar users (e.g., top 5)
  const topN = 5;
  const topSimilarUsers = similarities.slice(0, topN);

  // Collect books that similar users have rated highly but are not in targetBooks
  const recommendedBooks = new Set<string>();

  topSimilarUsers.forEach(({ userId: similarUserId }) => {
    const similarUserRatings = userRatingsMap[similarUserId];
    similarUserRatings.forEach((rating, isbn) => {
      if (!targetBooks.has(isbn) && rating >= 8) {
        recommendedBooks.add(isbn);
      }
    });
  });

  // If the query included years, limit recommended books to the same decades
  if (yearList.length > 0) {
    const targetDecades = yearList.map((yearStr: string) => {
      const year = parseInt(yearStr);
      return Math.floor(year / 10) * 10;
    });

    const filteredRecommendedBooks = new Set<string>();
    recommendedBooks.forEach((isbn) => {
      const book = books.find((b) => b.ISBN === isbn);
      if (book) {
        const bookDecade = Math.floor(book.Year / 10) * 10;
        if (targetDecades.includes(bookDecade)) {
          filteredRecommendedBooks.add(isbn);
        }
      }
    });
    recommendedBooks.clear();
    filteredRecommendedBooks.forEach((isbn) => recommendedBooks.add(isbn));
  }

  // Convert the set to an array and limit to top M books (e.g., top 10)
  const recommendedBooksArray = Array.from(recommendedBooks).slice(0, 10);

  // Get book details from Books data
  const recommendedBookDetails = books.filter((book) =>
    recommendedBooksArray.includes(book.ISBN)
  );

  return ctx.json(recommendedBookDetails);
});

app.get('/books', async (ctx: any) => {
  const books = [...books_1 as Book[], ...books_2 as Book[], ...books_3 as Book[], ...books_4 as Book[], ...books_5 as Book[], ...books_6 as Book[]].flat();
  return ctx.json(books.map((book) => book.Title));
});

export default {
  port: 4200,
  fetch: app.fetch,
};