require('dotenv').config();
const { Novu } = require('@novu/node');
const express = require('express');
const cron = require('cron');
const { OpenAIApi, Configuration } = require('openai');
const { XataClient } = require('./src/xata');

const app = express();
const novu = new Novu(process.env.NOVU_API_KEY);
const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));
const xata = new XataClient({ apiKey: process.env.XATA_API_KEY });

const novuTrigger = async (email, name, message, event, giftIdeas) => {
    await novu.trigger('wish-notif', {
        to: {
            subscriberId: email,
            email: email,
        },
        payload: {
            user: name,
            event: event,
            giftlist: giftIdeas,
            name: name,
            message: message,
        },
    });
};

const getAIGiftSuggestions = async (name, event, interest) => {
    const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: `Suggest gift ideas for ${event} of ${name} in one sentence but in a detailed and descriptive manner, given they are interested in ${interest}.`,
        temperature: 0.9,
        max_tokens: 2048,
        top_p: 1,
        frequency_penalty: 0.5,
        presence_penalty: 0,
    });
    return response.data.choices[0].text;
};

const wishBirthday = async (email, name, interest) => {
    const birthdayMessages = [
        "Wish them well!",
        "Convey your love!",
        "Make them feel special!",
        "Send them a message!",
        "Wish them a happy birthday!",
        "Send them a birthday wish!",
        "Send them a birthday message!",
    ];
    const randomMessage = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];
    const giftIdeas = await getAIGiftSuggestions(name, 'birthday', interest);
    await novuTrigger(email, name, randomMessage, 'birthday', giftIdeas);
};

const wishAnniversary = async (email, name, interest) => {
    const anniversaryMessages = [
        "Wish them well!",
        "Convey your love!",
        "Make them feel special!",
        "Send them a message!",
        "Wish them a happy anniversary!",
        "Send them an anniversary wish!",
        "Send them an anniversary message!",
    ];
    const randomMessage = anniversaryMessages[Math.floor(Math.random() * anniversaryMessages.length)];
    const giftIdeas = await getAIGiftSuggestions(name, 'anniversary', interest);
    await novuTrigger(email, name, randomMessage, 'anniversary', giftIdeas);
};

const getAllRecords = async () => {
    const records = await xata.db.contacts.getAll();
    return records;
};

const birthdayToday = async () => {
    const records = await getAllRecords();
    const today = new Date();
    const todayString = today.toISOString().slice(5, 10);
    const birthdayToday = [];
    for (const record of records) {
        if (record.birthday && record.birthday.toISOString().slice(5, 10) === todayString) {
            birthdayToday.push(record);
        }
    }
    return birthdayToday;
};

const anniversaryToday = async () => {
    const records = await getAllRecords();
    const today = new Date();
    const todayString = today.toISOString().slice(5, 10);
    const anniversaryToday = [];
    for (const record of records) {
        if (record.anniversary && record.anniversary.toISOString().slice(5, 10) === todayString) {
            anniversaryToday.push(record);
        }
    }
    return anniversaryToday;
};

const wisher = async () => {
    console.log("It's a new day, let's wish some people!");
    const birthday = await birthdayToday();
    const anniversary = await anniversaryToday();
    for (const { manager, name, interests } of birthday) {
        await wishBirthday(manager, name, interests);
    }
    for (const { manager, name, interests } of anniversary) {
        await wishAnniversary(manager, name, interests);
    }
};

const job = new cron.CronJob('0 0 * * *', wisher);

app.listen(5151, () => {
    console.log('Server started on port 5151');
});

app.post('/', async (req, res) => {
    const authorizationHeader = await req.headers['authorization'];
    if (authorizationHeader !== process.env.SECURITY_KEY) {
        return res.json({
            message: 'Invalid security key!'
        });
    }
    
    const email = req.query.email;
    const user = req.query.name;
    const interests = req.query.interests;
    if (!email || !user || !interests) {
        return res.json({
            message: 'Missing parameters!',
            query: req.query
        });
    }
    
    const giftideas = await getAIGiftSuggestions(user, 'upcoming birthday and anniversary', interests);
    
    novu.trigger('get-gift-ideas', {
        to: {
            subscriberId: email,
            email: email
        },
        payload: {
            user: user,
            giftideas: giftideas
        }
    });
    
    return res.json({
        message: 'Sent!',
        query: req.query
    });
});
console.log('Starting cron job...');
job.start();