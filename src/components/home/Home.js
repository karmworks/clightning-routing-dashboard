import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import RouterIcon from '@mui/icons-material/Router';
import Tooltip from '@mui/material/Tooltip';
import './Home.css';
import { VictoryBar, VictoryChart, VictoryAxis, VictoryVoronoiContainer, VictoryLine, VictoryTooltip, VictoryStack, VictoryGroup, VictoryLegend, VictoryScatter } from 'victory';
import { LinearProgress } from "@mui/material";


const Home = () => {
    let location = useLocation();
    let navigate = useNavigate();
    const [exception, setException] = useState({
        error: false,
        code: '',
        message: ''
    });
    const [connectionStatus, setConnectionStatus] = useState({
        initialized: true,
        connected: true    
    });
    const [getinfo, setGetInfo] = useState(null);
    const [listfunds, setListFunds] = useState({
        onchain: null,
        offchain: null
    });
    const [listpeers, SetListPeers] = useState(null);
    const [listforwards, SetListForwards] = useState({
        settled: null,
        failed: null,
        localfailed: null,
        offered: null,
        settledSats: null,
        settledChannelsWithPPM: null
    });
    const [externalMutations, SetExternalMutations] = useState([]);

    let nodesocket = null;
    let satsFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: "0", maximumFractionDigits: "0" });
    let btcFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: "0", maximumFractionDigits: "6" });
    let tickerFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: "0", maximumFractionDigits: "3" });
    let chartDays = 1;

    async function flattenListPeers(connectionValues, result, node_id) {

        let list_peers = [];

        for (const element of result.peers) {


            if (element.channels.length > 0) {

                let list_nodes_res = await go(connectionValues, "listnodes", { id: element.id });
                let alias = list_nodes_res.result.nodes.length > 0 ? list_nodes_res.result.nodes[0].alias : "";
                let sum_msatoshi_to_us_min = element.channels.reduce((accumulator, channel) => { return accumulator + channel.msatoshi_to_us_min; }, 0);
                let sum_msatoshi_to_us_max = element.channels.reduce((accumulator, channel) => { return accumulator + channel.msatoshi_to_us_max; }, 0);
                let no_sats_moved = 0;
                if (sum_msatoshi_to_us_min === sum_msatoshi_to_us_max) {//Add an indicator if the peer is neither a source or a sink
                    no_sats_moved = 5000000000;
                }
                let sum_in_msatoshi_fulfilled = element.channels.reduce((accumulator, channel) => { return accumulator + channel.in_msatoshi_fulfilled; }, 0);
                let sum_out_msatoshi_fulfilled = element.channels.reduce((accumulator, channel) => { return accumulator + channel.out_msatoshi_fulfilled; }, 0);

                for (const channel of element.channels)  {

                    let list_channels_res = await go(connectionValues, "listchannels", { short_channel_id: channel.short_channel_id });
                    let peer_channel = list_channels_res.result.channels.find((channel => channel.destination === node_id));
                    let msatoshi_peer = channel.msatoshi_total - channel.msatoshi_to_us;
                    if (channel.state === 'CHANNELD_NORMAL') {
                        list_peers.push({
                            ...channel,
                            alias,
                            sum_in_msatoshi_fulfilled,
                            sum_out_msatoshi_fulfilled,
                            no_sats_moved,
                            msatoshi_peer,
                            node_id: element.id,
                            connected: element.connected,
                            peer_fee_ppm: peer_channel.fee_per_millionth,
                            peer_base_fee: peer_channel.base_fee_millisatoshi/1000

                        });
                    }

                };

            }

        };
        
        return list_peers;
    }

    async function calculateFunds(funds) {

        let onchainFunds = funds.outputs.reduce((accumulator, fund) => {return accumulator + fund.value;}, 0);
        let offchainFunds = funds.channels.reduce((accumulator, fund) => {return fund.state === 'CHANNELD_NORMAL' ||  fund.state === 'CHANNELD_AWAITING_LOCKIN' ? accumulator + fund.channel_sat : accumulator;}, 0);
        setListFunds({
            onchain: onchainFunds,
            offchain: offchainFunds
        })
    }

    async function processForwards(result) {

        let settledForwards = result.forwards.filter(forward => forward.status === 'settled');
        let localfailedForwards = result.forwards.filter(forward => forward.status === 'local_failed');
        let failedForwards = result.forwards.filter(forward => forward.status === 'failed');
        let offeredForwards = result.forwards.filter(forward => forward.status === 'offered');

        let totalFee = 0;
        let settledSats = 0;
        let settledChannels = [];
        let settledChannelsWithPPM = [];
        settledForwards.forEach(element => {
            totalFee = totalFee + element.fee;
            settledSats = settledSats + (element.out_msatoshi / 1000);
            if (!settledChannels.includes(element.out_channel)){
                settledChannels.push(element.out_channel);
            }
        });

        settledChannels.forEach((channel) => {
            let settledChannelForwards = settledForwards.filter(forward => forward.out_channel === channel);
            let totalChannelFeeMSats = settledChannelForwards.reduce((accumulator, forward) => {return accumulator + forward.fee ;}, 0);
            let totalChannelOutMSats = settledChannelForwards.reduce((accumulator, forward) => {return accumulator + forward.out_msatoshi ;}, 0);
            let maxPPM = settledChannelForwards.reduce((max, forward) => {return max >  (forward.fee * 1000000 / forward.out_msatoshi) ? max : (forward.fee * 1000000 / forward.out_msatoshi);}, 0)
            let averagePPM = totalChannelFeeMSats * 1000000 / totalChannelOutMSats;
            settledChannelsWithPPM.push({short_channel_id: channel, averagePPM: averagePPM, maxPPM: maxPPM });
        });

        SetListForwards({
            settled: settledForwards,
            localfailed: localfailedForwards,
            failed: failedForwards,
            offered: offeredForwards,
            settledSats: settledSats,
            settledChannelsWithPPM: settledChannelsWithPPM
        })
    }

    function fetchFromStorage() {
        try {
            const lnodeconnect = localStorage.getItem("lnodeconnect");

            if (lnodeconnect) {
                let lnFromStorage = JSON.parse(window.atob(lnodeconnect));

                return lnFromStorage;
            }
            else {
                return null;
            }
        }
        catch (error) {
            console.log(error);
            return null;
        }
    }

    const handleRedirect = (path) => {

        const location = {
            pathname: path
        }

        navigate(location);

    }

    function checkError(response) {

        if(!response){
            setException({
                error: true,
                code: '',
                message: ''
            });
            return true;
        }
        else if(response.name === 'RuntimeError' && response.message.indexOf('Cannot allocate Wasm') > -1 ){
            setException({
                error: true,
                code: '',
                message: 'More than one browser tab may be running the Plebnode dashboard. Please close the other tabs and refresh the page.'
            });
            return true;
        }
        else if (response && response.error) {
            console.log(response);
            setException({
                error: true,
                code: response.error.code,
                message: response.error.message
            });
            return true;
        }
        else {
            return false;
        }
    }

    useEffect(() => {

        let timer = null;
        const lnscript = "/lnsocket.js";
        let script = document.querySelector(`script[src="${lnscript}"]`);

        let connectionValues = fetchFromStorage();

        if (!connectionValues) {
            handleRedirect('/settings');
        }

        function loadData(connectionValues) {

            go(connectionValues, "getinfo").then((res) => {

                setGetInfo(res.result);
                let node_id = res.result.id;

                go(connectionValues, "listfunds").then((listfunds_response) => {

                    calculateFunds(listfunds_response.result);
                    
                    go(connectionValues, "listforwards").then((response) => {

                        processForwards(response.result);

                        go(connectionValues, "listpeers").then((res) => {

                            flattenListPeers(connectionValues, res.result, node_id).then((response) => {
                                SetListPeers(response)
                            });

                            clearTimeout(timer);
                            timer = setTimeout(function () {
                                loadData(connectionValues)
                            }, 60000)

                        }).catch((error) => {
                            console.log(error);
                        })

                    });

                });

            }).catch((error) => {
                console.log(error);
            })
        };

        const handleScript = (e) => {
            if (e.type === "load") {
                loadData(connectionValues);
            }
            else {
                console.log('error loading script');
            }
        };

        if (!script) {
            script = document.createElement('script');
            script.type = "application/javascript";
            script.src = lnscript;
            script.async = true;
            document.body.appendChild(script);
            script.addEventListener("load", handleScript);
            script.addEventListener("error", handleScript);
        }
        else {//script was added during the initial load. This is route change as useEffect is dependent on location object
            loadData(connectionValues);
            
        }


        return () => {
            script.removeEventListener("load", handleScript);
            script.removeEventListener("error", handleScript);
        }

    }, [location]);


    async function init_socket(connectionValues) {

        if (nodesocket) {
            return true;
        }
        try {
            const LNSocket = await lnsocket_init(); // eslint-disable-line
            nodesocket = LNSocket();
            nodesocket.genkey();
            await nodesocket.connect_and_init(connectionValues.nodeid, `ws://${connectionValues.ipaddress}:${connectionValues.port}`);
            return true;
        }
        catch (error) {
            console.log("socket init error: ", error);
            checkError(error);
            setConnectionStatus({
                initialized: false,
                connected: false
            });
            return false;
        }
    }

    async function go(connectionValues, method, params, retry) {

        let res;

        if (await init_socket(connectionValues)) {

            const rune = connectionValues.rune;
            try {
                res = await nodesocket.rpc({ method: method, params: params, rune });
                setConnectionStatus({
                    initialized: true,
                    connected: true
                });
                checkError(res);
            }
            catch (error) {
                console.log("socket connection error: ", error);
                setConnectionStatus({
                    ...connectionStatus,
                    connected: false
                });
                nodesocket = null;//re-establish connection;
                res = await go(connectionValues, method, params);
            }
        }

        return res
    }

    // find maxima for normalizing data
    function getMaxima(field){
        
        if(field === 'PPM'){
            return listpeers.reduce((max, peer) => {return max > peer.fee_proportional_millionths ? max : peer.fee_proportional_millionths;}, 0)
        } 
        else if(field === 'MSATOSHI_TOTAL'){
            return listpeers.reduce((max, peer) => {return max > peer.msatoshi_total ? max : peer.msatoshi_total;}, 0)
        }
       
    }

    function getAlias(short_channel_id){

        let peer = listpeers.find((item) => item.short_channel_id === short_channel_id);

        if(peer){
            return peer.alias;
        }
        else{
            return 'Peer Not Found'
        }

    }

    function getHtlcs(htlcs){
        if(htlcs.length > 0){
            let soonestExpiry = htlcs.reduce((min, htlc) => {return min < htlc.expiry ? min : htlc.expiry ;}, 100000000);
            let inHtlc = htlcs.reduce((count, htlc) => {return htlc.direction === "in"? count+1: count;}, 0);
            let outHtlc = htlcs.reduce((count, htlc) => {return htlc.direction === "out"? count+1: count;}, 0);

            return `\n-----\nPending HTLCs\n Earliest Expiry: ${soonestExpiry - getinfo.blockheight } blocks.\nIn HTLCs: ${inHtlc}, Out HTLCs: ${outHtlc}\n------`;

        }
        else{
            return '';
        }
    }

    function getChannelLabel(datum){

        let settledChannelWithPPM = listforwards.settledChannelsWithPPM.find((channel) => channel.short_channel_id === datum.short_channel_id);
       return `Peer Alias: ${datum.alias}\nShort Channel Id: ${datum.short_channel_id}\nLocal: ${satsFormatter.format(datum.msatoshi_to_us / 1000)} sats\nRemote: ${satsFormatter.format(datum.msatoshi_peer / 1000)} sats\n Fee PPM: ${satsFormatter.format(datum.fee_proportional_millionths)} ppm
Settled Max Fee: ${settledChannelWithPPM ? satsFormatter.format(settledChannelWithPPM.maxPPM): 0} ppm
Settled Avg. Fee: ${settledChannelWithPPM ? satsFormatter.format(settledChannelWithPPM.averagePPM): 0} ppm
----- Peer Fee ------
Peer Base Fee: ${satsFormatter.format(datum.peer_base_fee)}
Peer Fee PPM: ${satsFormatter.format(datum.peer_fee_ppm)} ppm${getHtlcs(datum.htlcs)} ${datum.connected === false ? '\n------\nCHANNEL NOT CONNECTED\n----':''}`;
    }

    const copyToClipboard = str => {//copy channel id to clipboard on chart click, for further investigation
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(str);
        }

    };

    function setMutations(datum) {
        
        if(!datum){
            return;
        }

        let inChannelKey = listpeers.findIndex((channel) => channel.short_channel_id === datum.in_channel);
        let outChannelKey = listpeers.findIndex((channel) => channel.short_channel_id === datum.out_channel);

        SetExternalMutations([
            {
                childName: "our_sats_bar",
                target: "data",
                eventKey: "all",
                mutation: (props) => {
                    return {
                        style: Object.assign({}, props.style, { stroke: "" })
                    };
                }
            },
            {
                childName:  "their_sats_bar",
                target: "data",
                eventKey: "all",
                mutation: (props) => {
                    return {
                        style: Object.assign({}, props.style, { stroke: "" })
                    };
                }
            },
            {
                childName: 'our_sats_bar',
                eventKey: String(inChannelKey),
                target: ["data"],
                mutation: (props) => {
                    return {
                        style: Object.assign({}, props.style, { stroke: "white" })
                    };
                }
            },
            {
                childName: 'their_sats_bar',
                eventKey: String(inChannelKey),
                target: ["data"],
                mutation: (props) => {
                    return {
                        style: Object.assign({}, props.style, { stroke: "white" })
                    };
                }
            },
            {
                childName: 'our_sats_bar',
                eventKey: String(outChannelKey),
                target: ["data"],
                mutation: (props) => {
                    return {
                        style: Object.assign({}, props.style, { stroke: "black" })
                    };
                }
            },
            {
                childName: 'their_sats_bar',
                eventKey: String(outChannelKey),
                target: ["data"],
                mutation: (props) => {
                    return {
                        style: Object.assign({}, props.style, { stroke: "black" })
                    };
                }
            }
        ]);
    }

    return (

        <Grid container spacing={1} style={{ background: "lightgray", paddingLeft: "20px", paddingRight: "20px" }}>

            {!listpeers && <Grid item xs={12} sm={12} lg={12} >
                <LinearProgress color="secondary" />
                <LinearProgress color="secondary" />
            </Grid>}
            { !getinfo && exception.error && <Grid item xs={12} sm={12} lg={12} >
                <Typography variant="body" component="div" style={{ fontSize: "1em", backgroundColor: "red", padding: "10px", color: "white" }} color="black">
                    Error connecting to the node. Please check the connection settings. {exception.code? ` Error Received from Node: Code ${exception.code} ${exception.message}`: ''} 
                </Typography>
            </Grid>}
            {getinfo && <Grid item xs={12} sm={12} lg={12} >
                <List dense style={{ padding: "0px", }}>
                    <ListItem key="1" style={{ justifyContent: "center" }}>
                        <Typography variant="h5" component="span" color="black" style={{ fontSize: "1.4em", fontWeight: "bold", marginRight: "100px", overflowWrap: "anywhere" }}>
                            {getinfo.alias}
                        </Typography>
                        <Typography variant="body" component="span" style={{ fontSize: "2em" }} color="black">
                            <Tooltip title={`${connectionStatus.connected ? "Connection Status: Connected to lightning node, Auto Refresh: ON" : (connectionStatus.initialized ? "Connection Status: Connecting to lightning node, please wait." : "Connection Status: Disconnected from lightning node. Refresh browser to reconnect.")}`}>
                                <RouterIcon style={{ fontSize: "1.2em", verticalAlign: "super", color: `${connectionStatus.connected ? "green" : (connectionStatus.initialized ? "orange" : "red")}` }} />
                            </Tooltip>
                        </Typography>

                    </ListItem>
                </List>

                <List dense className="Figures" >
                    {listforwards && listforwards.settled && <ListItem key="1" style={{ justifyContent: "center" }}>
                        <ListItemText >
                            <Typography variant="subtitle2" component="span" style={{ fontWeight: "bold" }} color="black">Payments Routed: </Typography>
                            <Typography variant="body2" component="span" style={{ fontWeight: "bold" }} color="black"> {Intl.NumberFormat().format(listforwards.settled.length)}  </Typography>
                        </ListItemText>
                    </ListItem>}
                    {listforwards && listforwards.settled && <ListItem key="2" style={{ justifyContent: "center" }}>
                        <ListItemText>
                            <Typography variant="subtitle2" component="span" style={{ fontWeight: "bold" }} color="black">BTC Routed: </Typography>
                            <Typography variant="body2" component="span" style={{ fontWeight: "bold" }} color="black"> {`${btcFormatter.format(listforwards.settledSats / 100000000)}`}  </Typography>
                        </ListItemText>
                    </ListItem>}
                    {listforwards && listforwards.settled && getinfo && <ListItem key="3" style={{ justifyContent: "start" }}>
                        <ListItemText>
                            <Typography variant="subtitle2" component="span" style={{ fontWeight: "bold" }} color="black">Fee Gained: </Typography>
                            <Typography variant="body2" component="span" style={{ fontWeight: "bold" }} color="black"> {Intl.NumberFormat("en-US", { minimumFractionDigits: "0", maximumFractionDigits: "0" }).format(getinfo.msatoshi_fees_collected / 1000)} Sats</Typography>
                        </ListItemText>

                    </ListItem>}
                </List>
                <List dense className="Figures" style={{ borderTop: "none"}}>
                    {listfunds && listfunds.onchain && listfunds.offchain && <ListItem key="2" style={{ justifyContent: "center" }}>
                        <ListItemText>
                            <Typography variant="subtitle2" component="span" style={{ fontWeight: "bold" }} color="black">Lightning Balance: </Typography>
                            <Typography variant="body2" component="span" style={{ fontWeight: "bold" }} color="black"> {btcFormatter.format(listfunds.offchain / 100000000)} BTC </Typography>
                        </ListItemText>
                    </ListItem>}
                    {listfunds && listfunds.onchain && listfunds.offchain && <ListItem key="1" style={{ justifyContent: "center" }}>
                        <ListItemText >
                            <Typography variant="subtitle2" component="span" style={{ fontWeight: "bold" }} color="black">On-Chain Balance: </Typography>
                            <Typography variant="body2" component="span" style={{ fontWeight: "bold" }} color="black"> {btcFormatter.format(listfunds.onchain/ 100000000)} BTC </Typography>
                        </ListItemText>
                    </ListItem>}
                    {listfunds && listfunds.onchain && listfunds.offchain && <ListItem key="3" style={{ justifyContent: "start" }}>
                        <ListItemText>
                            <Typography variant="subtitle2" component="span" style={{ fontWeight: "bold" }} color="black">Total Balance: </Typography>
                            <Typography variant="body2" component="span" style={{ fontWeight: "bold" }} color="black"> {btcFormatter.format((listfunds.onchain + listfunds.offchain)/ 100000000)} BTC</Typography>
                        </ListItemText>

                    </ListItem>}
                </List>
            </Grid>}

            <Grid item xs={12} sm={6} lg={6} style={{ height: "40vh", paddingRight: "20px" }}>
                {(listforwards.failed || listforwards.localfailed || listforwards.settled || listforwards.offered) && listpeers &&
                    <VictoryChart
                        domainPadding={10}
                        maxDomain={{ x: (Date.now() / 1000) }}
                        minDomain={{ x: ((Date.now() / 1000) - 60 * 60 * 24 * chartDays) }}
                        containerComponent={
                            <VictoryVoronoiContainer
                                voronoiBlacklist={["settled", "failed", "localfailed"]}
                                onActivated={(points, props) => setMutations(points[0])}
                                labels={({ datum }) => `${datum.status === 'settled' ? 'Settled ' : (datum.status === 'local_failed' ? 'Local Failed ' : 'Failed ')} Forward:
${datum.status === 'local_failed' ? `Fail Code: ${datum.failcode}\n` : ''}${satsFormatter.format(datum.in_msatoshi / 1000)} sats
${new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'long' }).format(new Date(datum.received_time * 1000))}
In Channel: ${datum.in_channel} (${getAlias(datum.in_channel)})
Out Channel: ${datum.out_channel} (${getAlias(datum.out_channel)})${ datum.fee ? `\nFee PPM: ${satsFormatter.format(datum.fee * 1000000 / datum.out_msatoshi)}` : ''}`} 

                            />
                        }
                    >
                        <VictoryLegend x={45} y={10}
                            orientation="horizontal"
                            gutter={10}
                            style={{ labels: { fontSize: 11 } }}
                            data={[
                                { name: "Settled Forwards", symbol: { fill: "green" } },
                                { name: "Failed Forwards", symbol: { fill: "orange" } },
                                { name: "Local Failed Forwards", symbol: { fill: "red" } }
                            ]}
                        />
                        <VictoryAxis
                            label="Forwarded Payments - 24hr"
                            style={{ tickLabels: {} }}
                            tickFormat={(x) => (`${new Intl.DateTimeFormat('en', chartDays === 1 ? { hour: 'numeric' } : { month: '2-digit', day: '2-digit' }).format(new Date(x * 1000))}`)}


                        />
                        <VictoryAxis
                            dependentAxis
                            style={{ tickLabels: { fontSize: "9" } }}
                            tickFormat={(x) => (`${x / 100000000000} BTC`)}
                        />

                        <VictoryLine
                            name="failed"
                            interpolation="linear"
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            style={{ data: { stroke: "orange" } }}
                            data={listforwards.failed.filter((forward) => forward.received_time > (Date.now() / 1000) - 60 * 60 * 24 * chartDays)} x="received_time" y="in_msatoshi"

                        />
                        <VictoryScatter
                            style={{ data: { fill: "orange" } }}
                            data={listforwards.failed.filter((forward) => forward.received_time > (Date.now() / 1000) - 60 * 60 * 24 * chartDays)} x="received_time" y="in_msatoshi"
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            events={[{
                                target: "data",
                                eventHandlers: {
                                    onClick: (event, source) => {
                                        copyToClipboard(`In Channel: ${source.datum.in_channel} Out Channel: ${source.datum.out_channel} `);//Copy short channel id to clipboard on click
                                        return [];
                                    }
                                }
                            }]}
                        ></VictoryScatter>
                        <VictoryLine
                            name="localfailed"
                            interpolation="linear"
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            style={{ data: { stroke: "red" } }}
                            data={listforwards.localfailed.filter((forward) => forward.received_time > (Date.now() / 1000) - 60 * 60 * 24 * chartDays)} x="received_time" y="in_msatoshi"

                        />
                        <VictoryScatter
                            style={{ data: { fill: "red" } }}
                            data={listforwards.localfailed.filter((forward) => forward.received_time > (Date.now() / 1000) - 60 * 60 * 24 * chartDays)} x="received_time" y="in_msatoshi"
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            events={[{
                                target: "data",
                                eventHandlers: {
                                    onClick: (event, source) => {
                                        copyToClipboard(`In Channel: ${source.datum.in_channel} Out Channel: ${source.datum.out_channel} `);//Copy short channel id to clipboard on click
                                        return [];
                                    }
                                }
                            }]}
                        ></VictoryScatter>
                        <VictoryLine
                            name="settled"
                            interpolation="linear"
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            style={{ data: { stroke: "green" } }}
                            data={listforwards.settled.filter((forward) => forward.received_time > (Date.now() / 1000) - 60 * 60 * 24 * chartDays)} x="received_time" y="in_msatoshi"

                        />
                        <VictoryScatter
                            style={{ data: { fill: "green" } }}
                            data={listforwards.settled.filter((forward) => forward.received_time > (Date.now() / 1000) - 60 * 60 * 24 * chartDays)} x="received_time" y="in_msatoshi"
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            events={[{
                                target: "data",
                                eventHandlers: {
                                    onClick: (event, source) => {
                                        copyToClipboard(`In Channel: ${source.datum.in_channel} Out Channel: ${source.datum.out_channel} `);//Copy short channel id to clipboard on click
                                        return [];
                                    }
                                }
                            }]}
                        ></VictoryScatter>
                    </VictoryChart>}
            </Grid>
            <Grid item xs={12} sm={6} lg={6} style={{ height: "40vh", paddingRight: "20px" }} >
                {(listforwards.failed || listforwards.localfailed || listforwards.settled || listforwards.offered) && listpeers &&
                    <VictoryChart
                        domainPadding={10}
                        maxDomain={{ x: (Date.now() / 1000) }}
                        minDomain={{ x: ((Date.now() / 1000) - 60 * 60 * 24 * chartDays) }}

                        containerComponent={
                            <VictoryVoronoiContainer
                                voronoiBlacklist={["earnedFee"]}
                                onActivated={(points, props) => setMutations(points[0])}
                                labels={({ datum }) =>  `Fee Gained:\n${satsFormatter.format(datum.fee / 1000)} sats\n${new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'long' }).format(new Date(datum.received_time * 1000))}
In Channel: ${datum.in_channel} (${getAlias(datum.in_channel)})
Out Channel: ${datum.out_channel} (${getAlias(datum.out_channel)})${ datum.fee ? `\nFee PPM: ${satsFormatter.format(datum.fee * 1000000 / datum.out_msatoshi)}` : ''}`} 
                            />
                        }
                    >
                        <VictoryLegend x={45} y={10}
                            orientation="horizontal"
                            gutter={10}
                            style={{ labels: { fontSize: 11 } }}
                            data={[
                                { name: "Fee Gained", symbol: { fill: "green" } }
                            ]}
                        />
                        <VictoryAxis
                            label="Fee Gained - 24hr"
                            style={{ tickLabels: {} }}
                            tickFormat={(x) => (`${new Intl.DateTimeFormat('en', chartDays === 1 ? { hour: 'numeric' } : { month: '2-digit', day: '2-digit' }).format(new Date(x * 1000))}`)}


                        />
                        <VictoryAxis
                            dependentAxis
                            style={{ tickLabels: { fontSize: "9" } }}
                            tickFormat={(x) => (`${satsFormatter.format(x / 1000)} sats`)}
                        />

                        <VictoryScatter
                            style={{ data: { fill: "green" } }}
                            data={listforwards.settled.filter((forward) => (forward.received_time * 1000) > (Date.now() - 60 * 60 * 24 * chartDays * 1000))} x="received_time" y="fee"
                            events={[{
                                target: "data",
                                eventHandlers: {
                                    onClick: (event, source) => {
                                        copyToClipboard(`In Channel: ${source.datum.in_channel} Out Channel: ${source.datum.out_channel} `);//Copy short channel id to clipboard on click
                                        return [];
                                    }
                                }
                            }]}
                        >
                        </VictoryScatter>
                        <VictoryLine
                            name="earnedFee"
                            data={listforwards.settled.filter((forward) => (forward.received_time * 1000) > (Date.now() - 60 * 60 * 24 * chartDays * 1000))} x="received_time" y="fee"
                            interpolation="linear"
                            style={{ data: { stroke: "green" } }}
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 2000 }
                            }} />

                    </VictoryChart>}
            </Grid>
            <Grid item xs={12} sm={6} lg={6} style={{ height: "40vh", paddingRight: "20px" }} >
                {listpeers && listforwards.settledChannelsWithPPM &&  <VictoryChart externalEventMutations={externalMutations} events={[ {target: "data",eventHandlers: {}} ]} domainPadding={10}>
                    <VictoryLegend x={45} y={10}
                        orientation="horizontal"
                        gutter={10}
                        style={{ labels: { fontSize: 11 } }}
                        data={[
                            { name: "Local Sats", symbol: { fill: "#e28743" } },
                            { name: "Remote Sats", symbol: { fill: "#00a3de" } },
                            { name: "Fee - PPM", symbol: { fill: "#7c270b" } }
                        ]}
                    />
                    <VictoryAxis
                        label="Channel Liquidity &amp; Fee PPM"
                        style={{ tickLabels: { display: "None" } }}

                    />
                    <VictoryAxis
                        dependentAxis
                        style={{ tickLabels: { fontSize: "9" } }}
                        // Re-scale ticks by multiplying by correct maxima
                        tickFormat={(x) => (`${tickerFormatter.format((x * getMaxima('MSATOSHI_TOTAL')) / 100000000000)} BTC`)}
                    />
                    <VictoryAxis
                        dependentAxis
                        orientation="right"
                        style={{
                            axis: { stroke: "#7c270b" },
                            tickLabels: { fontSize: "9" , fill: "#7c270b" }
                          }}
                        offsetX={50}
                        // Re-scale ticks by multiplying by correct maxima
                        tickFormat={(t) => (`${new Intl.NumberFormat("en-US", { minimumFractionDigits: "0", maximumFractionDigits: "0" }).format(t * getMaxima('PPM'))} ppm `)}
                    />
                    <VictoryStack>
                        <VictoryBar
                            name="our_sats_bar"
                            style={{ data: {fill: ({datum}) => datum.connected === true ? '#e28743': 'dimgray', strokeWidth: 2, stroke: ({datum}) => datum.htlcs.length > 0 ? 'red': '' } }}
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            data={listpeers} x="short_channel_id" y={(datum) => datum.msatoshi_to_us / getMaxima('MSATOSHI_TOTAL')}
                            labels={({ datum }) => getChannelLabel(datum)}
                            labelComponent={<VictoryTooltip />}
                            events={[{
                                target: "data",
                                eventHandlers: {
                                  onClick: (event, source) => {
                                    copyToClipboard(source.datum.short_channel_id);//Copy short channel id to clipboard on click
                                    return [];
                                  }
                                }
                              }]}
                        /><VictoryBar
                            name="their_sats_bar"
                            style={{ data: { fill: ({datum}) => datum.connected === true ? '#00a3de': 'gray', strokeWidth: 2, stroke: ({datum}) => datum.htlcs.length > 0 ? 'red': '' } }}
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            data={listpeers} x="short_channel_id"  y={(datum) => datum.msatoshi_peer / getMaxima('MSATOSHI_TOTAL')}
                            labels={({ datum }) => getChannelLabel(datum)}
                            events={[{
                                target: "data",
                                eventHandlers: {
                                  onClick: (event, source) => {
                                    copyToClipboard(source.datum.short_channel_id);//Copy short channel id to clipboard on click
                                    return [];
                                  }
                                }
                              }]}
                            labelComponent={<VictoryTooltip />}
                        />    
                    </VictoryStack>
                    <VictoryScatter
                            key={'ppm'}
                            style={{ data: { fill: "#7c270b" } }}
                            data={listpeers} x="short_channel_id" y={(datum) => datum.fee_proportional_millionths / getMaxima('PPM')}
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            labels={({ datum }) => `Peer Alias: ${datum.alias}
                            Short Channel Id: ${datum.short_channel_id}
                            Fee PPM: ${datum.fee_proportional_millionths} ppm`}
                                                        labelComponent={<VictoryTooltip />}
                        ></VictoryScatter>

                </VictoryChart>}
            </Grid>
            <Grid item xs={12} sm={6} lg={6} style={{ height: "40vh", paddingRight: "20px" }} >
                {listpeers && listforwards.settledChannelsWithPPM && <VictoryChart minDomain={{ y: 0 }}>
                    <VictoryLegend x={45} y={10}
                        orientation="horizontal"
                        gutter={10}
                        style={{ labels: { fontSize: 11 } }}
                        data={[
                            { name: "Source", symbol: { fill: "#00a3de" } },
                            { name: "Sink", symbol: { fill: "#ef5675" } },
                            { name: "Neither", symbol: { fill: "black" } }
                        ]}
                    />
                    <VictoryAxis
                        label="Peers - Source/Sink"
                        style={{ tickLabels: { display: "None" } }}
                    />
                    <VictoryAxis
                        dependentAxis
                        style={{ tickLabels: { fontSize: "9" } }}
                        tickFormat={(x) => (`${x / 100000000000} BTC`)}
                    />
                    <VictoryGroup offset={3}
                        colorScale={"qualitative"}
                    >
                        <VictoryBar
                            data={listpeers}
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            style={{ data: { fill: "#00a3de" } }} x="node_id" y="sum_in_msatoshi_fulfilled"
                            labels={({ datum }) => `Peer Alias: ${datum.alias}
Inbound Forwarding Fulfilled: ${satsFormatter.format(datum.sum_in_msatoshi_fulfilled / 1000)} sats
Outbound Forwarding Fulfilled: ${satsFormatter.format(datum.sum_out_msatoshi_fulfilled / 1000)} sats`}
                            labelComponent={<VictoryTooltip />}
                        />

                        <VictoryBar
                            data={listpeers}
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            style={{ data: { fill: "#ef5675" } }} x="node_id" y="sum_out_msatoshi_fulfilled"
                            labels={({ datum }) => `Peer Alias: ${datum.alias}
Inbound Forwarding Fulfilled: ${satsFormatter.format(datum.sum_in_msatoshi_fulfilled / 1000)} sats
Outbound Forwarding Fulfilled: ${satsFormatter.format(datum.sum_out_msatoshi_fulfilled / 1000)} sats`}
                            labelComponent={<VictoryTooltip />}


                        />
                         <VictoryBar
                            data={listpeers}
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            style={{ data: { fill: "black" } }} x="node_id" y="no_sats_moved"
                            labels={({ datum }) => `Peer Alias: ${datum.alias}
Inbound Forwarding Fulfilled: ${satsFormatter.format(datum.sum_in_msatoshi_fulfilled / 1000)} sats
Outbound Forwarding Fulfilled: ${satsFormatter.format(datum.sum_out_msatoshi_fulfilled / 1000)} sats`}
                            labelComponent={<VictoryTooltip />}


                        />
                    </VictoryGroup>
                </VictoryChart>}
            </Grid>
        </Grid>
    );

}
export default Home;