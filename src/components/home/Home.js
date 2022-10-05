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
    const [loading, setLoading] = useState(true);
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
    const [listpeers, SetListPeers] = useState(null);
    const [listforwards, SetListForwards] = useState({
        settled: null,
        failed: null,
        localfailed: null,
        offered: null,
        settledSats: null
    });

    let nodesocket = null;
    let satsFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: "0", maximumFractionDigits: "0" });
    let btcFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: "0", maximumFractionDigits: "6" });
    let chartDays = 1;

    async function flattenListPeers(connectionValues, result) {

        let list_peers = [];

        for (const element of result.peers) {


            if (element.connected && element.channels.length > 0) {

                let list_nodes_res = await go(connectionValues, "listnodes", { id: element.id });
                let alias = list_nodes_res.result.nodes.length > 0 ? list_nodes_res.result.nodes[0].alias : "";
                element.sum_msatoshi_total = element.channels.reduce((accumulator, channel) => {return accumulator + channel.msatoshi_total;}, 0);
                element.sum_msatoshi_to_us = element.channels.reduce((accumulator, channel) => {return accumulator + channel.msatoshi_to_us;}, 0);
                element.sum_msatoshi_to_us_min = element.channels.reduce((accumulator, channel) => {return accumulator + channel.msatoshi_to_us_min;}, 0);
                element.sum_msatoshi_to_us_max = element.channels.reduce((accumulator, channel) => {return accumulator + channel.msatoshi_to_us_max;}, 0);
                if(element.sum_msatoshi_to_us_min === element.sum_msatoshi_to_us_max){//Add an indicator if the peer is neither a source or a sink
                    element.no_sats_moved = 5000000000;
                }
                else{
                    element.no_sats_moved = 0;
                }
                element.msatoshi_peer = element.sum_msatoshi_total - element.sum_msatoshi_to_us;
                element.sum_in_msatoshi_fulfilled = element.channels.reduce((accumulator, channel) => {return accumulator + channel.in_msatoshi_fulfilled;}, 0);
                element.sum_out_msatoshi_fulfilled = element.channels.reduce((accumulator, channel) => {return accumulator + channel.out_msatoshi_fulfilled;}, 0);

                list_peers.push({
                    ...{ "alias": alias },
                    ...element
                });
            }

        };

        return list_peers;
    }

    async function processForwards(result) {

        let settledForwards = result.forwards.filter(forward => forward.status === 'settled');
        let localfailedForwards = result.forwards.filter(forward => forward.status === 'local_failed');
        let failedForwards = result.forwards.filter(forward => forward.status === 'failed');
        let offeredForwards = result.forwards.filter(forward => forward.status === 'offered');

        let totalFee = 0;
        let settledSats = 0;
        settledForwards.forEach(element => {
            totalFee = totalFee + element.fee;
            settledSats = settledSats + (element.out_msatoshi / 1000);
        });



        SetListForwards({
            settled: settledForwards,
            localfailed: localfailedForwards,
            failed: failedForwards,
            offered: offeredForwards,
            settledSats: settledSats
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
            console.log('inside')
            setException({
                error: true,
                code: '',
                message: ''
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

                go(connectionValues, "listforwards").then((response) => {

                    processForwards(response.result);

                    go(connectionValues, "listpeers").then((res) => {
                        
                        flattenListPeers(connectionValues, res.result).then((response) => {
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

                setLoading(false);

            }).catch((error) => {
                console.log(error);
                setLoading(false);
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
            setLoading(true);
            loadData(connectionValues);
            
        }


        return () => {
            console.log("removing listeners");
            script.removeEventListener("load", handleScript);
            script.removeEventListener("error", handleScript);
        }

    }, [location]);


    async function init_socket(connectionValues) {

        if (nodesocket) {
            return true;
        }
        try {
            console.log("creating socket");
            const LNSocket = await lnsocket_init(); // eslint-disable-line
            nodesocket = LNSocket();
            nodesocket.genkey();
            await nodesocket.connect_and_init(connectionValues.nodeid, `ws://${connectionValues.ipaddress}:${connectionValues.port}`);
            console.log("socket created");
            return true;
        }
        catch (error) {
            console.log("socket init error: {}", error);
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
                console.log("socket connection error: {}", error);
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

    function getAlias(short_channel_id){

        let peer = listpeers.find((peer) => {return peer.channels.find((item) => item.short_channel_id === short_channel_id);});

        if(peer){
            return peer.alias;
        }
        else{
            return 'Peer Not Found'
        }

    }

    return (

        <Grid container spacing={1} style={{ background: "lightgray", paddingLeft: "20px" }}>

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
                            {'MyAwesomeNode'}
                        </Typography>
                        <Typography variant="body" component="span" style={{ fontSize: "2em" }} color="black">
                            <Tooltip title={`${connectionStatus.connected ? "Connection Status: Connected to lightning node, Auto Refresh: ON" : (connectionStatus.initialized ? "Connection Status: Connecting to lightning node, please wait." : "Connection Status: Disconnected from lightning node. Refresh browser to reconnect.")}`}>
                                <RouterIcon style={{ fontSize: "1.2em", verticalAlign: "super", color: `${connectionStatus.connected ? "green" : (connectionStatus.initialized ? "orange" : "red")}` }} />
                            </Tooltip>
                        </Typography>

                    </ListItem>
                </List>

                <List dense style={{ display: "flex", flexDirection: "row", padding: "0px" }}>
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
                                labels={({ datum }) => `${datum.status === 'settled' ? 'Settled ' : (datum.status === 'local_failed' ? 'Local Failed ' : 'Failed ')} Forward:
${datum.status === 'local_failed' ? `Fail Code: ${datum.failcode}\n` : ''}${satsFormatter.format(datum.in_msatoshi / 1000)} sats
${new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'long' }).format(new Date(datum.received_time * 1000))}
In Channel: ${datum.in_channel} (${getAlias(datum.in_channel)})
Out Channel: ${datum.out_channel} (${getAlias(datum.out_channel)})`} 

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
                                labels={({ datum }) => `Fee Gained:\n${satsFormatter.format(datum.fee / 1000)} sats\n${new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'long' }).format(new Date(datum.received_time * 1000))}
In Channel: ${datum.in_channel} (${getAlias(datum.in_channel)})
Out Channel: ${datum.out_channel} (${getAlias(datum.out_channel)})`} 
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
                            data={listforwards.settled.filter((forward) => (forward.received_time * 1000) > (Date.now() - 60 * 60 * 24 * chartDays * 1000))} x="received_time" y="fee"></VictoryScatter>
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
                {listpeers && <VictoryChart domainPadding={10}>
                    <VictoryLegend x={45} y={10}
                        orientation="horizontal"
                        gutter={10}
                        style={{ labels: { fontSize: 11 } }}
                        data={[
                            { name: "Local Sats", symbol: { fill: "#7a5195" } },
                            { name: "Remote Sats", symbol: { fill: "#ef5675" } }
                        ]}
                    />
                    <VictoryAxis
                        label="Channel Balances"
                        style={{ tickLabels: { display: "None" } }}

                    />
                    <VictoryAxis
                        dependentAxis
                        style={{ tickLabels: { fontSize: "9" } }}
                        tickFormat={(x) => (`${x / 100000000000} BTC`)}
                    />
                    <VictoryStack>
                        <VictoryBar
                            style={{ data: { fill: "#7a5195" } }}
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            data={listpeers} x="alias" y="sum_msatoshi_to_us"
                            labels={({ datum }) => `Peer Alias: ${datum.alias}
Short Channel Id: ${datum.channels.reduce((accumulator, channel) => {return accumulator + channel.short_channel_id + '\n';}, '')}
Local: ${satsFormatter.format(datum.sum_msatoshi_to_us / 1000)} sats
Remote: ${satsFormatter.format(datum.msatoshi_peer / 1000)} sats`}
                            labelComponent={<VictoryTooltip />}

                        /><VictoryBar
                            style={{ data: { fill: "#ef5675" } }}
                            animate={{
                                duration: 2000,
                                onLoad: { duration: 1000 }
                            }}
                            data={listpeers} x="alias" y="msatoshi_peer"
                            labels={({ datum }) => `Peer Alias: ${datum.alias}
Short Channel Id: ${datum.channels.reduce((accumulator, channel) => {return accumulator + channel.short_channel_id + '\n';}, '')}
Local: ${satsFormatter.format(datum.sum_msatoshi_to_us / 1000)} sats
Remote: ${satsFormatter.format(datum.msatoshi_peer / 1000)} sats`}
                            labelComponent={<VictoryTooltip />}
                        />
                    </VictoryStack>

                </VictoryChart>}
            </Grid>
            <Grid item xs={12} sm={6} lg={6} style={{ height: "40vh", paddingRight: "20px" }} >
                {listpeers && <VictoryChart minDomain={{ y: 0 }}>
                    <VictoryLegend x={45} y={10}
                        orientation="horizontal"
                        gutter={10}
                        style={{ labels: { fontSize: 11 } }}
                        data={[
                            { name: "Source", symbol: { fill: "#00a3de" } },
                            { name: "Sink", symbol: { fill: "#7c270b" } },
                            { name: "Neither", symbol: { fill: "red" } }
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
                            style={{ data: { fill: "#00a3de" } }} x="alias" y="sum_in_msatoshi_fulfilled"
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
                            style={{ data: { fill: "#7c270b" } }} x="alias" y="sum_out_msatoshi_fulfilled"
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
                            style={{ data: { fill: "red" } }} x="alias" y="no_sats_moved"
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