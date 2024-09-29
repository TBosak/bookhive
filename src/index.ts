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
  const books = [
    ...(books_1 as Book[]),
    ...(books_2 as Book[]),
    ...(books_3 as Book[]),
    ...(books_4 as Book[]),
    ...(books_5 as Book[]),
    ...(books_6 as Book[]),
  ];
  const result = books.find((book) => book.Title === title);
  console.log(result);
  return ctx.json(result);
});

app.get('/recommend', async (ctx) => {
  // Accept lists of titles, authors, and years from the query parameters
  const titlesParam = ctx.req.query('titles');
  let titleList: string[] = [];

  if (titlesParam) {
    titleList = titlesParam.split(';').map((t) => decodeURIComponent(t.trim()));
  } else {
    // Fallback to the existing method
    titleList = ctx.req.queries('title') || [];
  }

  const authorsParam = ctx.req.query('authors');
  let authorList: string[] = [];

  if (authorsParam) {
    authorList = authorsParam.split(';').map((a) => decodeURIComponent(a.trim()));
  } else {
    authorList = ctx.req.queries('author') || [];
  }

  const yearsParam = ctx.req.query('years');
  let yearList: string[] = [];

  if (yearsParam) {
    yearList = yearsParam.split(';').map((y) => decodeURIComponent(y.trim()));
  } else {
    yearList = ctx.req.queries('year') || [];
  }

  if (titleList.length === 0 && authorList.length === 0 && yearList.length === 0) {
    return ctx.json({ error: "At least one 'title', 'author', or 'year' query parameter is required" }, 400);
  }

  // Logging parsed values
    console.log('Title List:', titleList);
    console.log('Author List:', authorList);
    console.log('Year List:', yearList);

  const books = [
    ...(books_1 as Book[]),
    ...(books_2 as Book[]),
    ...(books_3 as Book[]),
    ...(books_4 as Book[]),
    ...(books_5 as Book[]),
    ...(books_6 as Book[]),
  ];
  
  const ratings = [
    ...(ratings_1 as Rating[]),
    ...(ratings_2 as Rating[]),
    ...(ratings_3 as Rating[]),
    ...(ratings_4 as Rating[]),
    ...(ratings_5 as Rating[]),
    ...(ratings_6 as Rating[]),
  ];
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
    const author = normalizeAuthorName(book.Author);
    if (!authorToISBNsMap.has(author)) {
      authorToISBNsMap.set(author, new Set());
    }
    authorToISBNsMap.get(author)?.add(book.ISBN);
  });

  authorList.forEach((author: string) => {
    const normalizedAuthor = normalizeAuthorName(author);
    const isbns = authorToISBNsMap.get(normalizedAuthor);
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
      const bookYear = parseInt(book.Year as any);
      const bookDecade = Math.floor(bookYear / 10) * 10;
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

  // Compute Jaccard similarity between target books and each user's highly-rated books
  const similarities: { userId: string; similarity: number }[] = [];

  for (const [userId, userRatings] of Object.entries(userRatingsMap)) {
    // Consider only books the user has rated highly
    const userHighRatedBooks = new Set<string>();
    userRatings.forEach((rating, isbn) => {
      if (rating >= 4) {
        userHighRatedBooks.add(isbn);
      }
    });

    // Skip users who have not rated any books highly
    if (userHighRatedBooks.size === 0) continue;

    const intersectionSize = [...targetBooks].filter((isbn) => userHighRatedBooks.has(isbn)).length;
    const unionSize = new Set([...targetBooks, ...userHighRatedBooks]).size;

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
  // Keep track of how many similar users rated each book highly
  const recommendedBooksMap: Map<string, { count: number; totalRating: number }> = new Map();

  topSimilarUsers.forEach(({ userId: similarUserId }) => {
    const similarUserRatings = userRatingsMap[similarUserId];
    similarUserRatings.forEach((rating, isbn) => {
      if (!targetBooks.has(isbn) && rating >= 7) {
        if (!recommendedBooksMap.has(isbn)) {
          recommendedBooksMap.set(isbn, { count: 1, totalRating: rating });
        } else {
          const existing = recommendedBooksMap.get(isbn)!;
          existing.count += 1;
          existing.totalRating += rating;
        }
      }
    });
  });

  // Convert the recommendedBooksMap to an array and sort by count and average rating
  const recommendedBooksArray = Array.from(recommendedBooksMap.entries())
    .map(([isbn, data]) => ({
      isbn,
      count: data.count,
      avgRating: data.totalRating / data.count,
    }))
    .sort((a, b) => {
      // First sort by count (number of similar users who rated it highly)
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      // Then sort by average rating
      return b.avgRating - a.avgRating;
    });

  // If the query included years, limit recommended books to the same decades
  let filteredRecommendedBooksArray = recommendedBooksArray;

  if (yearList.length > 0) {
    const targetDecades = yearList.map((yearStr: string) => {
      const year = parseInt(yearStr);
      return Math.floor(year / 10) * 10;
    });

    filteredRecommendedBooksArray = recommendedBooksArray.filter(({ isbn }) => {
      const book = books.find((b) => b.ISBN === isbn);
      if (book) {
        const bookYear = parseInt(book.Year as any);
        const bookDecade = Math.floor(bookYear / 10) * 10;
        return targetDecades.includes(bookDecade);
      }
      return false;
    });
  }

  // Limit to top M books (e.g., top 10)
  const topM = 10;
  const finalRecommendedBooks = filteredRecommendedBooksArray.slice(0, topM);

  // Get book details from Books data
  const recommendedBookDetails = finalRecommendedBooks.map(({ isbn }) =>
    books.find((book) => book.ISBN === isbn)
  ).filter(Boolean) as Book[];

  return ctx.json(recommendedBookDetails);
});

app.get('/books', async (ctx: any) => {
  const books = [
    ...(books_1 as Book[]),
    ...(books_2 as Book[]),
    ...(books_3 as Book[]),
    ...(books_4 as Book[]),
    ...(books_5 as Book[]),
    ...(books_6 as Book[]),
  ];
  return ctx.json(books.map((book) => book.Title));
});

app.get('/privacy-policy', async (ctx) => {
  return ctx.json({ message: 'This is the privacy policy, we store no data' });
});

app.get('/', async (ctx) => {
  return ctx.json({ message: 'Healthy' });
});

function normalizeAuthorName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
}

export default {
  port: 8000,
  fetch: app.fetch,
};