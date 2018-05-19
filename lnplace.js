require('dotenv').config();

const {
  LND_HOMEDIR,
  LISTEN_PORT,
  DB_NAME,
  NODE_ENV,
} = process.env;

const grpc = require('grpc');
const fs = require('fs');
const helmet = require('helmet');
const logger = require('winston');
const express = require('express');
const bodyParser = require('body-parser');

const LND_UNAVAILABLE = {
  status: 503,
  message: 'LND on server is down',
};

const logDir = 'log';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const lndCert = fs.readFileSync(`${LND_HOMEDIR}tls.cert`);
const credentials = grpc.credentials.createSsl(lndCert);
const lnrpcDescriptor = grpc.load('rpc.proto');
const lightning = new lnrpcDescriptor.lnrpc.Lightning('127.0.0.1:10009', credentials);

const adminMacaroon = fs.readFileSync(`${LND_HOMEDIR}admin.macaroon`);
const meta = new grpc.Metadata();
meta.add('macaroon', adminMacaroon.toString('hex'));

const urlencodedParser = bodyParser.urlencoded({
  extended: true,
});

const { MongoClient } = require('mongodb');

const dbUrl = 'mongodb://127.0.0.1:27017';

const app = express();
app.use(express.static('public'));
app.use(helmet());
let db;

/**
 * The current RGB values
 */
const colors = Array(...Array(255)).map(() => '#FFFFFF');

/**
 * The pending invoices
 */
const invoices = {};

/**
 * An array of clients listening to server side events
 */
const listeners = [];

/**
 * Creates an index on r_hash for invoices if it doesn't exist.
 * Fetches the most recent colors from the database.
 */
async function init() {
  db.collection('colors').find().sort({
    _id: -1,
  }).toArray()
    .then(async (dbColors) => {
      for (let n = 0; n < dbColors.length; n += 1) {
        const { _id, hex } = dbColors[n];
        colors[_id] = hex;
      }
    });
}

/**
 * Adds an invoice to lnd.
 * @returns - A promise that resolves when the invoice is added
 */
function addInvoice() {
  return new Promise((resolve, reject) => lightning.addInvoice({
    value: 1,
    memo: 'lnplace',
  }, meta, (err, response) => {
    if (err) {
      if (err.code === 14) {
        reject(LND_UNAVAILABLE);
      } else {
        const error = new Error(`Server error: ${err.message}`);
        error.status = 500;
        reject(error);
      }
    } else {
      resolve(response);
    }
  }));
}

app.get('/colors', (req, res) => {
  res.status(200).json({
    colors,
  });
});

app.get('/listen', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  listeners.push(res);
});

app.post('/invoice', urlencodedParser, (req, res) => {
  logger.info(`invoice request: ${JSON.stringify(req.body)}`);
  if (!req.body.color || !req.body.index) {
    res.status(400).end();
  } else {
    // valid so far, check for and validate payment request
    let responseBody;
    addInvoice().then((response) => {
      responseBody = {
        payment_request: response.payment_request,
      };

      const invoice = {
        index: req.body.index,
        color: req.body.color,
        r_hash: response.r_hash.toString('hex'),
        value: 1,
      };

      invoices[invoice.r_hash] = invoice;
      logger.verbose(`invoice added: ${JSON.stringify(responseBody)}`);
      res.status(200).json(responseBody);
    }).catch((err) => {
      if (err.status) {
        logger.error(err.message);
        res.status(err.status).send(err.message);
      } else {
        logger.error(err);
        res.status(400).send(err.message);
      }
    });
  }
});

/**
 * Send an event
 * @param event - The event type to send
 */
function sendEvent(event) {
  for (let n = 0; n < listeners.length; n += 1) {
    const listener = listeners[n];
    if (listener && !listener.finished) {
      try {
        listener.write(`data: ${event}\n\n`);
      } catch (err) {
        listeners[n] = undefined;
        logger.error(err);
      }
    }
  }
}

/**
 * Updates a pixel and notifies all listening clients
 * @param invoice - The invoice for the purchase
 */
async function purchasePixel(invoice) {
  try {
    const newVals = { _id: invoice.index, hex: invoice.color };
    await db.collection('colors').replaceOne(
      { _id: invoice.index },
      { $set: newVals },
      { upsert: true },
    );

    colors[invoice.r_hash] = invoice.color;
    sendEvent(`${invoice.r_hash} ${invoice.color}`);
  } catch (err) {
    logger.error(err);
  }
}

/**
 * Handler for updates on lightning invoices
 * @param data - The data from the lightning invoice subscription
 * @returns - A promise that resolves once the invoice is handled
 * and updated, or undefined if the invoice was not settled
 */
async function invoiceHandler(data) {
  if (data.settled) {
    const r_hash = data.r_hash.toString('hex');

    try {
      const invoice = invoices[r_hash];
      if (invoice) {
        logger.info(`invoice settled: ${JSON.stringify(invoice)}`);

        await purchasePixel(invoice);
      }
    } catch (err) {
      logger.error(err);
      throw err;
    }
  }
  return false;
}

lightning.subscribeInvoices({}, meta).on('data', invoiceHandler).on('end', () => {
  logger.warn('subscribeInvoices ended');
}).on('status', (status) => {
  logger.debug(`subscribeInvoices status: ${JSON.stringify(status)}`);
})
  .on('error', (error) => {
    logger.error(`subscribeInvoices error: ${error}`);
  });

MongoClient.connect(dbUrl).then((connection) => {
  db = connection.db(DB_NAME);
  return init();
}).then(() => {
  // listen and write logs only when started directly
  if (!module.parent) {
    const tsFormat = () => (new Date()).toLocaleString();
    logger.configure({
      transports: [
        new (logger.transports.Console)({
          timestamp: tsFormat,
          colorize: true,
        }),
        new (logger.transports.File)({
          filename: `${logDir}/lnplace.log`,
          timestamp: tsFormat,
        }),
      ],
    });

    logger.level = NODE_ENV === 'development' ? 'debug' : 'info';
    app.listen(LISTEN_PORT, () => {
      logger.info(`App listening on port ${LISTEN_PORT}`);
    });
  } else {
    // don't log at all if not started directly
    logger.clear();
  }
}).catch((err) => {
  logger.error(`Error on initialization: ${err}`);
});
