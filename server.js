require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const { createClient } = require('@supabase/supabase-js');

const express = require('express');

const cors = require('cors');

const https = require('https');



// ── Config ─────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.BOT_TOKEN;

const GUILD_ID = process.env.GUILD_ID;

const CATEGORY_ID = process.env.CATEGORY_ID;

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PORT = process.env.PORT || 3000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const GITHUB_REPO = process.env.GITHUB_REPO;

const GITHUB_OWNER = process.env.GITHUB_OWNER;



// Validate required environment variables

if (!BOT_TOKEN) {

    console.error('❌ BOT_TOKEN is missing! Set it in .env');

    process.exit(1);

}



if (!GUILD_ID) {

    console.error('❌ GUILD_ID is missing! Set it in .env');

    process.exit(1);

}



if (!CATEGORY_ID) {

    console.error('❌ CATEGORY_ID is missing! Set it in .env');

    process.exit(1);

}



if (!ADMIN_ROLE_ID) {

    console.error('❌ ADMIN_ROLE_ID is missing! Set it in .env');

    process.exit(1);

}



// ── Supabase Client ────────────────────────────────────────────────────────

const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

if (!supabase) {

    console.warn('⚠️ Supabase not configured - bot will not save orders to database');

}



// ── GitHub Upload Function ─────────────────────────────────────────────────

async function uploadToGitHub(filename, content) {

    if (!GITHUB_TOKEN || !GITHUB_REPO || !GITHUB_OWNER) {

        console.warn('⚠️ GitHub not configured - skipping upload');

        return null;

    }



    const path = `bot/${filename}`;

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;



    const options = {

        method: 'PUT',

        headers: {

            'Authorization': `token ${GITHUB_TOKEN}`,

            'Content-Type': 'application/json',

            'User-Agent': 'DiscordBot'

        },

        body: JSON.stringify({

            message: `Upload transcript: ${filename}`,

            content: Buffer.from(content).toString('base64')

        })

    };



    return new Promise((resolve, reject) => {

        const req = https.request(url, options, (res) => {

            let data = '';

            res.on('data', chunk => data += chunk);

            res.on('end', () => {

                if (res.statusCode >= 200 && res.statusCode < 300) {

                    const response = JSON.parse(data);

                    resolve(response.content.download_url);

                } else {

                    console.error('❌ GitHub upload error:', res.statusCode, data);

                    reject(new Error(`GitHub upload failed: ${res.statusCode}`));

                }

            });

        });



        req.on('error', reject);

        req.write(options.body);

        req.end();

    });

}



// ── Discord Client ─────────────────────────────────────────────────────────

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMessages,

        GatewayIntentBits.MessageContent,

        GatewayIntentBits.GuildMessageReactions

    ]

});



client.once('ready', async () => {

    console.log(`✅ Bot logged in as ${client.user.tag}`);

    console.log(`📊 Serving guild: ${GUILD_ID}`);

    console.log(`📁 Category ID: ${CATEGORY_ID}`);

    console.log(`👑 Admin Role ID: ${ADMIN_ROLE_ID}`);



    // Register slash commands

    const commands = [];



    try {

        await client.application.commands.set(commands, GUILD_ID);

        console.log('✅ Slash commands registered');

    } catch (err) {

        console.error('❌ Error registering slash commands:', err);

    }

});



// ── Express API ────────────────────────────────────────────────────────────

const app = express();

app.use(express.json());

app.use(cors({

    origin: '*',

    methods: ['GET', 'POST']

}));



// Health check endpoint

app.get('/', (req, res) => {

    console.log('🌐 Health check requested');

    res.json({

        status: 'online',

        bot: client.user ? client.user.tag : 'connecting...',

        uptime: Math.floor(process.uptime()) + 's',

        supabase: supabase ? 'connected' : 'not configured'

    });

});



// ── POST /create-order ────────────────────────────────────────────────────

app.post('/create-order', async (req, res) => {
    try {
        const { orderId, username, discordId, items, total } = req.body;
        console.log('📥 Received order request:', orderId);
        
        // Save order to memory (in production, save to database)
        const newOrder = {
            id: orderId,
            username,
            discord_id: discordId,
            items,
            total,
            status: 'pending',
            processed: false,
            discordSent: false,
            date: new Date().toISOString()
        };
        
        // Store in memory (for this session)
        if (!global.orders) global.orders = [];
        global.orders.push(newOrder);
        
        console.log('✅ Order saved:', orderId);
        res.json({ success: true, orderId: newOrder.id });
    } catch (err) {
        console.error('❌ Create order error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /create-ticket ────────────────────────────────────────────────────

app.post('/create-ticket', async (req, res) => {

    try {

        console.log('📥 Received ticket request:', req.body);

        

        const { username, discordId, items, total } = req.body;



        // Validate required fields

        if (!username) {

            console.log('❌ Username is missing');

            return res.status(400).json({ error: 'Username is required' });

        }



        if (!items || items.length === 0) {

            console.log('❌ Cart is empty');

            return res.status(400).json({ error: 'Cart is empty' });

        }



        if (!total) {

            console.log('❌ Total is missing');

            return res.status(400).json({ error: 'Total is required' });

        }



        console.log('🔍 Fetching guild:', GUILD_ID);

        const guild = await client.guilds.fetch(GUILD_ID);

        if (!guild) {

            console.log('❌ Guild not found');

            return res.status(500).json({ error: 'Guild not found' });

        }

        console.log('✅ Guild found:', guild.name);



        // Build safe channel name

        const safeName = username

            .toLowerCase()

            .replace(/[^a-z0-9\u0600-\u06ff]/g, '-')

            .replace(/-+/g, '-')

            .slice(0, 20) || 'user';

        const channelName = `ticket-${safeName}`;

        console.log('📝 Creating channel:', channelName, 'in category:', CATEGORY_ID);



        // Create ticket channel inside category

        const channel = await guild.channels.create({

            name: channelName,

            type: ChannelType.GuildText,

            parent: CATEGORY_ID,

            topic: `🛒 Order ticket for ${username}`,

            permissionOverwrites: [

                {

                    id: guild.roles.everyone,

                    deny: [PermissionFlagsBits.ViewChannel]

                },

                {

                    id: ADMIN_ROLE_ID,

                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]

                },

                {

                    id: client.user.id,

                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.UseApplicationCommands]

                }

            ]

        });

        console.log('✅ Channel created:', channel.name, 'ID:', channel.id);



        // Build items list for embed

        const itemsList = items.map(item => {

            const typeEmoji = {

                vehicle: '🚗',

                house: '🏠',

                mapping: '🗺️',

                accessoires: '💎',

                character: '👤',

                job: '💼'

            }[item.type] || '📦';

            return `${typeEmoji} **${item.name}** — $${item.price}`;

        }).join('\n');



        // Build professional embed

        const embed = new EmbedBuilder()

            .setTitle('🛒 طلب جديد — New Order')

            .setColor(0x10b981)

            .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')

            .addFields(

                {

                    name: '👤 العميل / Customer',

                    value: discordId ? `<@${discordId}>` : username,

                    inline: true

                },

                {

                    name: '💰 الإجمالي / Total',

                    value: `**$${total}**`,

                    inline: true

                },

                {

                    name: '📦 المنتجات / Items',

                    value: itemsList || 'No items'

                },

                {

                    name: '📋 التعليمات / Instructions',

                    value: 'سيتواصل معك أحد المشرفين قريباً لإتمام الطلب.\nAn admin will contact you shortly to complete your order.'

                }

            )

            .setFooter({ text: 'WLAD HLAL Store' })

            .setTimestamp();



        // Create buttons - Close + Options

        const row = new ActionRowBuilder()

            .addComponents(

                new ButtonBuilder()

                    .setCustomId('close_ticket')

                    .setLabel('❌ Close Ticket')

                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()

                    .setCustomId('options_ticket')

                    .setLabel('⚙️ Options')

                    .setStyle(ButtonStyle.Secondary)

            );



        // Create select menu for options

        const selectMenu = new StringSelectMenuBuilder()

            .setCustomId('ticket_options')

            .setPlaceholder('📋 Select an option...')

            .addOptions(

                {

                    label: 'Accept Order',

                    description: 'Accept this order and mark as completed',

                    value: 'accept_ticket',

                    emoji: '✅'

                },

                {

                    label: 'Cancel Order',

                    description: 'Cancel this order',

                    value: 'cancel_ticket',

                    emoji: '❌'

                },

                {

                    label: 'Pending Order',

                    description: 'Set order back to pending',

                    value: 'pending_ticket',

                    emoji: '⏳'

                }

            );



        const selectRow = new ActionRowBuilder()

            .addComponents(selectMenu);



        console.log('🔘 Button created');

        console.log('🔘 Button JSON:', JSON.stringify(row.toJSON()));

        console.log('🔘 Sending message with button to channel:', channel.id);



        // Send embed with button in ticket channel

        const message = await channel.send({

            content: `<@&${ADMIN_ROLE_ID}> — طلب جديد يحتاج مراجعة! ${discordId ? `<@${discordId}>` : ''}`,

            embeds: [embed],

            components: [row, selectRow]

        });

        console.log('✅ Message sent with button to channel');

        console.log('✅ Message components:', JSON.stringify(message.components));



        // Save order to Supabase if configured

        if (supabase) {

            try {

                const order = {

                    username,

                    discord_id: discordId || null,

                    items,

                    total,

                    status: 'pending',

                    processed: false,

                    created_at: new Date().toISOString()

                };

                

                const { error } = await supabase

                    .from('orders')

                    .insert([order]);

                

                if (error) {

                    console.error('❌ Failed to save order to Supabase:', error);

                } else {

                    console.log('✅ Order saved to Supabase');

                }

            } catch (supabaseError) {

                console.error('❌ Supabase error:', supabaseError);

            }

        }



        console.log(`✅ Ticket created successfully: #${channelName} for ${username}`);

        res.json({ 

            success: true, 

            channelId: channel.id, 

            channelName,

            message: 'Ticket created successfully'

        });



    } catch (err) {

        console.error('❌ Ticket creation error:', err.message);

        console.error('❌ Full error:', err);

        res.status(500).json({ error: err.message });

    }

});



// ── POST /complete-order ───────────────────────────────────────────────────

app.post('/complete-order', async (req, res) => {

    try {

        const { orderId } = req.body;



        if (!orderId) {

            return res.status(400).json({ error: 'Order ID is required' });

        }



        if (!supabase) {

            return res.status(500).json({ error: 'Supabase not configured' });

        }



        console.log('📥 Completing order:', orderId);



        const { error } = await supabase

            .from('orders')

            .update({ status: 'completed', processed: true })

            .eq('id', orderId);



        if (error) {

            console.error('❌ Error completing order:', error);

            return res.status(500).json({ error: error.message });

        }



        console.log('✅ Order completed:', orderId);

        res.json({ success: true, message: 'Order completed' });



    } catch (err) {

        console.error('❌ Complete order error:', err.message);

        res.status(500).json({ error: err.message });

    }

});



// ── POST /cancel-order ─────────────────────────────────────────────────────

app.post('/cancel-order', async (req, res) => {

    try {

        const { orderId } = req.body;



        if (!orderId) {

            return res.status(400).json({ error: 'Order ID is required' });

        }



        if (!supabase) {

            return res.status(500).json({ error: 'Supabase not configured' });

        }



        console.log('📥 Cancelling order:', orderId);



        const { error } = await supabase

            .from('orders')

            .update({ status: 'cancelled', processed: true })

            .eq('id', orderId);



        if (error) {

            console.error('❌ Error cancelling order:', error);

            return res.status(500).json({ error: error.message });

        }



        console.log('✅ Order cancelled:', orderId);

        res.json({ success: true, message: 'Order cancelled' });



    } catch (err) {

        console.error('❌ Cancel order error:', err.message);

        res.status(500).json({ error: err.message });

    }

});



// ── GET /orders ──────────────────────────────────────────────────────────────

app.get('/orders', async (req, res) => {

    try {

        if (!supabase) {

            return res.status(500).json({ error: 'Supabase not configured' });

        }



        const { data, error } = await supabase

            .from('orders')

            .select('*')

            .order('created_at', { ascending: false });



        if (error) {

            console.error('❌ Error fetching orders:', error);

            return res.status(500).json({ error: error.message });

        }



        console.log(`✅ Fetched ${data.length} orders`);

        res.json({ success: true, orders: data });



    } catch (err) {

        console.error('❌ Fetch orders error:', err.message);

        res.status(500).json({ error: err.message });

    }

});



// ── GET /products/:type ─────────────────────────────────────────────────────

app.get('/products/:type', async (req, res) => {

    try {

        const { type } = req.params;

        const validTypes = ['vehicles', 'houses', 'mapping', 'accessoires', 'characters', 'jobs', 'products'];



        if (!validTypes.includes(type)) {

            return res.status(400).json({ error: 'Invalid product type' });

        }



        if (!supabase) {

            return res.status(500).json({ error: 'Supabase not configured' });

        }



        console.log(`📥 Fetching ${type} from Supabase`);



        const { data, error } = await supabase

            .from(type)

            .select('*')

            .order('created_at', { ascending: false });



        if (error) {

            console.error(`❌ Error fetching ${type}:`, error);

            return res.status(500).json({ error: error.message });

        }



        console.log(`✅ Fetched ${data.length} ${type}`);

        res.json({ success: true, data });



    } catch (err) {

        console.error('❌ Fetch products error:', err.message);

        res.status(500).json({ error: err.message });

    }

});



// ── POST /products/:type ─────────────────────────────────────────────────────

app.post('/products/:type', async (req, res) => {

    try {

        const { type } = req.params;

        const validTypes = ['vehicles', 'houses', 'mapping', 'accessoires', 'characters', 'jobs', 'products'];



        if (!validTypes.includes(type)) {

            return res.status(400).json({ error: 'Invalid product type' });

        }



        if (!supabase) {

            return res.status(500).json({ error: 'Supabase not configured' });

        }



        const product = req.body;

        console.log(`📥 Saving ${type} to Supabase:`, product);



        const { data, error } = await supabase

            .from(type)

            .insert([product])

            .select();



        if (error) {

            console.error(`❌ Error saving ${type}:`, error);

            return res.status(500).json({ error: error.message });

        }



        console.log(`✅ Saved ${type} to Supabase`);

        res.json({ success: true, data: data[0] });



    } catch (err) {

        console.error('❌ Save product error:', err.message);

        res.status(500).json({ error: err.message });

    }

});



// ── DELETE /products/:type/:id ───────────────────────────────────────────────

app.delete('/products/:type/:id', async (req, res) => {

    try {

        const { type, id } = req.params;

        const validTypes = ['vehicles', 'houses', 'mapping', 'accessoires', 'characters', 'jobs', 'products'];



        if (!validTypes.includes(type)) {

            return res.status(400).json({ error: 'Invalid product type' });

        }



        if (!supabase) {

            return res.status(500).json({ error: 'Supabase not configured' });

        }



        console.log(`📥 Deleting ${type} with id ${id}`);



        const { error } = await supabase

            .from(type)

            .delete()

            .eq('id', id);



        if (error) {

            console.error(`❌ Error deleting ${type}:`, error);

            return res.status(500).json({ error: error.message });

        }



        console.log(`✅ Deleted ${type} from Supabase`);

        res.json({ success: true, message: 'Product deleted' });



    } catch (err) {

        console.error('❌ Delete product error:', err.message);

        res.status(500).json({ error: err.message });

    }

});



// ── Message Handler (Commands) ───────────────────────────────────────────────

client.on('messageCreate', async (message) => {

    if (message.author.bot) return;

});



// ── Interaction Handler (Buttons & Slash Commands) ───────────────────────────

client.on('interactionCreate', async (interaction) => {

    console.log('🎯 Interaction received:', interaction.type, interaction.customId);



    // Handle slash commands

    if (interaction.isChatInputCommand()) {

        // No slash commands registered

    }



    // Handle buttons

    if (interaction.isButton()) {

        const { customId, channel, user } = interaction;

        console.log('Button clicked:', customId, 'by:', user.username);



        if (customId === 'close_ticket') {

            console.log(`Close button clicked by ${user.username} in channel ${channel.name}`);



            try {

                await interaction.reply({ content: 'سيتم إغلاق هذه التذكرة خلال 5 ثوانٍ...' });

                console.log('Reply sent successfully');



                setTimeout(() => {

                    channel.delete()

                        .then(() => console.log(`Channel ${channel.name} deleted`))

                        .catch(err => console.error('Failed to delete channel:', err));

                }, 5000);

            } catch (err) {

                console.error('Error handling close button:', err);

            }

        }



        if (customId === 'options_ticket') {

            console.log(`Options button clicked by ${user.username} in channel ${channel.name}`);



            try {

                const member = await interaction.guild.members.fetch(interaction.user.id);

                const isStaff = member.roles.cache.has(ADMIN_ROLE_ID);



                if (!isStaff) {

                    await interaction.reply({ content: 'هذا الأمر متاح فقط للمشرفين!', ephemeral: true });

                    return;

                }



                const selectMenu = new StringSelectMenuBuilder()

                    .setCustomId('ticket_options')

                    .setPlaceholder('اختر خيار / Select an option')

                    .addOptions(

                        {

                            label: 'Accept Order',

                            description: 'Accept this order and mark as completed',

                            value: 'accept_ticket',

                            emoji: '\u2705'

                        },

                        {

                            label: 'Cancel Order',

                            description: 'Cancel this order',

                            value: 'cancel_ticket',

                            emoji: '\u274c'

                        },

                        {

                            label: 'Pending Order',

                            description: 'Set order back to pending',

                            value: 'pending_ticket',

                            emoji: '\u23f3'

                        }

                    );



                const selectRow = new ActionRowBuilder()

                    .addComponents(selectMenu);



                await interaction.reply({

                    content: '**اختر خياراً / Select an option:**',

                    components: [selectRow],

                    ephemeral: true

                });

                console.log('Options select menu shown');

            } catch (err) {

                console.error('Error handling options button:', err);

            }

        }

    }



    // Handle select menu

    if (interaction.isStringSelectMenu()) {

        const { customId, values, channel, user } = interaction;

        console.log('Select menu used:', customId, 'value:', values[0]);



        if (customId === 'ticket_options') {

            const selectedValue = values[0];



            try {

                const member = await interaction.guild.members.fetch(interaction.user.id);

                const isStaff = member.roles.cache.has(ADMIN_ROLE_ID);



                if (!isStaff) {

                    await interaction.reply({ content: 'هذا الأمر متاح فقط للمشرفين!', ephemeral: true });

                    return;

                }



                const channelName = channel.name;

                const username = channelName.replace('ticket-', '').replace(/-/g, ' ');



                if (selectedValue === 'accept_ticket') {

                    await interaction.reply({ content: 'تم قبول التذكرة! سيتم التواصل مع العميل قريبا.' });



                    if (supabase) {

                        const { error } = await supabase

                            .from('orders')

                            .update({ status: 'completed', processed: true })

                            .eq('username', username)

                            .eq('status', 'pending');



                        if (error) {

                            console.error('Error updating order in Supabase:', error);

                        } else {

                            console.log('Order marked as completed in Supabase for user:', username);

                        }

                    }



                    const acceptEmbed = new EmbedBuilder()

                        .setTitle('طلب مقبول - Order Accepted')

                        .setColor(0x10b981)

                        .setDescription('تم قبول طلبك بنجاح! سيتواصل معك الفريق قريبا لإتمام العملية.\nYour order has been accepted! The team will contact you shortly.')

                        .setFooter({ text: 'WLAD HLAL Store' })

                        .setTimestamp();



                    await channel.send({ embeds: [acceptEmbed] });



                } else if (selectedValue === 'cancel_ticket') {

                    await interaction.reply({ content: 'تم إلغاء الطلب!' });



                    if (supabase) {

                        const { error } = await supabase

                            .from('orders')

                            .update({ status: 'cancelled', processed: true })

                            .eq('username', username)

                            .eq('status', 'pending');



                        if (error) {

                            console.error('Error updating order in Supabase:', error);

                        } else {

                            console.log('Order marked as cancelled in Supabase for user:', username);

                        }

                    }



                    const cancelEmbed = new EmbedBuilder()

                        .setTitle('طلب ملغى - Order Cancelled')

                        .setColor(0xef4444)

                        .setDescription('تم إلغاء الطلب.\nThe order has been cancelled.')

                        .setFooter({ text: 'WLAD HLAL Store' })

                        .setTimestamp();



                    await channel.send({ embeds: [cancelEmbed] });



                } else if (selectedValue === 'pending_ticket') {

                    await interaction.reply({ content: 'تم إرجاع الطلب إلى قيد الانتظار!' });



                    if (supabase) {

                        const { error } = await supabase

                            .from('orders')

                            .update({ status: 'pending', processed: false })

                            .eq('username', username);



                        if (error) {

                            console.error('Error updating order in Supabase:', error);

                        } else {

                            console.log('Order marked as pending in Supabase for user:', username);

                        }

                    }



                    const pendingEmbed = new EmbedBuilder()

                        .setTitle('طلب قيد الانتظار - Order Pending')

                        .setColor(0xf59e0b)

                        .setDescription('تم إرجاع الطلب إلى قيد الانتظار.\nThe order has been set back to pending.')

                        .setFooter({ text: 'WLAD HLAL Store' })

                        .setTimestamp();



                    await channel.send({ embeds: [pendingEmbed] });

                }



            } catch (err) {

                console.error('Error handling select menu:', err);

            }

        }

    }

});



// ── Error Handling ─────────────────────────────────────────────────────────

process.on('unhandledRejection', (error) => {

    console.error('❌ Unhandled Rejection:', error);

});



process.on('uncaughtException', (error) => {

    console.error('❌ Uncaught Exception:', error);

});



// ── Start Server ───────────────────────────────────────────────────────────

app.listen(PORT, () => {

    console.log(`🌐 API running on port ${PORT}`);

    console.log(`🌐 Server URL: http://localhost:${PORT}`);

});



// ── Login to Discord ─────────────────────────────────────────────────────────

console.log('🔐 Logging in to Discord...');

client.login(BOT_TOKEN);

