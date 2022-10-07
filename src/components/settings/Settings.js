import React, { useState, useEffect } from "react";
import Grid from '@mui/material/Grid';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate, useLocation } from "react-router-dom";
import Ajv from 'ajv';
import addFormats from "ajv-formats"
import './Settings.css';
import { Button, Card, CardContent, CardHeader, Container, IconButton, TextField } from "@mui/material";

const Settings = () => {

    let location = useLocation();
    let navigate = useNavigate();
    const AjvSettings = new Ajv();
    addFormats(AjvSettings, ["ipv4", "ipv6", "hostname"]);

    const schema = {
        type: "object",
        "properties": {
            "nodeid": { "type": "string" },
            "ipaddress": {

                "anyOf": [
                    {
                        "type": "string",
                        "format": "ipv6"
                    },
                    {
                        "type": "string",
                        "format": "ipv4"
                    },
                    {
                        "type": "string",
                        "format": "hostname"
                    }
                ]

            },
            "port": { "type": "integer" },
            "rune": { "type": "string" }
        },
        required: ["port", "rune", "ipaddress", "nodeid"],
        additionalProperties: true
    }

    const validate = AjvSettings.compile(schema);

    const [values, setValues] = useState({
        nodeid: null,
        ipaddress: null,
        port: null,
        rune: null,
        nodeid_error: null,
        ipaddress_error: false,
        port_error: false,
        rune_error: false,
        type_error: false

    });

    const handleCancel = (event) => {
        event.preventDefault();
        handleRedirect('/');
    }

    const handleDelete = (event) => {
        event.preventDefault();

        localStorage.removeItem('lnodeconnect');
        setValues({
            nodeid: null,
            ipaddress: null,
            port: null,
            rune: null,
            nodeid_error: null,
            ipaddress_error: false,
            port_error: false,
            rune_error: false,
            type_error: false
        })
    }

    function fetchFromStorage() {
        try {
            const lnodeconnect = localStorage.getItem("lnodeconnect");

            if (lnodeconnect) {
                let lnFromStorage = JSON.parse(window.atob(lnodeconnect));
                let errorConnection = isErrorConnection(lnFromStorage);

                setValues({
                    nodeid: lnFromStorage.nodeid,
                    ipaddress: lnFromStorage.ipaddress,
                    port: lnFromStorage.port,
                    rune: lnFromStorage.rune,
                    nodeid_error: errorConnection ? errorConnection.nodeid : false,
                    ipaddress_error: errorConnection ? errorConnection.ipaddress : false,
                    port_error: errorConnection ? errorConnection.port : false,
                    rune_error: errorConnection ? errorConnection.rune : false

                })
            }

        }
        catch (error) {
            console.log(error);
        }
    }

    useEffect(() => {

        fetchFromStorage();


    }, [location]);

    function isErrorConnection(connection) {


        let isError = {
            nodeid: false,
            rune: false,
            ipaddress: false,
            port: false
        }

        const valid = validate(connection);
        if (!valid) {

             validate.errors.forEach((error) => {
                if (error.instancePath === '/nodeid') {
                    isError.nodeid = true;
                }
                if (error.instancePath === '/port') {
                    isError.port = true;
                }
                if (error.instancePath === '/ipaddress') {
                    isError.ipaddress = true;
                }
                if (error.instancePath === '/rune') {
                    isError.rune = true;
                }

            });

            return isError;

        }

        try {
            let cleanRune = connection.rune.trim().replace(/(^"|"$)/g, '');//remove any leading/trailing space or quotes
            let decodedRune = window.atob(cleanRune.replace(/_/g, '/').replace(/-/g, '+'));//Rune is url safe encoded so replace '_' & '-'  
            const restrictions = "method^list|method^get|method=summary&method/listdatastore";
            const restrictionsPreV12 = "method^list|method^get|method=summary&method/getsharedsecret&method/listdatastore";
            //Extract the restrictions substring starting with the first "method" occurance. 
            let decodedRestrictions = decodedRune.substr((decodedRune.indexOf("method")))
            //If it does not exactly match then rune is not a readonly rune.
            if (restrictions !== decodedRestrictions && restrictionsPreV12 !== decodedRestrictions) {
                isError.rune = true;
            }
        }
        catch (error) {
            console.log(error);
            isError.rune = true;
        }

        if (isError.rune || isError.port || isError.ipaddress || isError.nodeid) {
            return isError;
        }

        return false;

    }

    function handleSubmit(event) {
        event.preventDefault();

        let errorConnection = isErrorConnection(values);
        if (errorConnection) {
            setValues({
                ...values,
                nodeid_error: errorConnection.nodeid,
                ipaddress_error: errorConnection.ipaddress,
                port_error: errorConnection.port,
                rune_error: errorConnection.rune
            });
        }
        else {

            //setlocal storage
            let connectionString = {
                nodeid: values.nodeid.trim().replace(/(^"|"$)/g, ''),//remove any leading/trailing space or quotes
                ipaddress: values.ipaddress.replace(/(^"|"$)/g, ''),//remove any leading/trailing space or quotes
                port: values.port,
                rune: values.rune.trim().replace(/(^"|"$)/g, ''),//remove any leading/trailing space or quotes
                type: 'CLN',
                timestamp: Date.now()
            }
            
            localStorage.setItem("lnodeconnect", window.btoa(JSON.stringify(connectionString)));

            handleRedirect('/');
        }
    }


    const handleRedirect = (path) => {

        const location = {
            pathname: path
        }

        navigate(location);

    }

    function handleValueChange(event, code) {

        if (code === 'ID') {
            setValues({
                ...values,
                nodeid: event.target.value
            })
        }
        else if (code === 'IP') {
            setValues({
                ...values,
                ipaddress: event.target.value
            })
        }
        else if (code === 'PORT') {
            if (isNaN(event.target.value)) {
                return;
            }

            setValues({
                ...values,
                port: parseInt(event.target.value)
            })
        }
        else if (code === 'RUNE') {
            setValues({
                ...values,
                rune: event.target.value
            })
        }
        else if (code === 'TYPE') {

            if (event.target.value !== 'CLN') {
                return;
            }

            setValues({
                ...values,
                type: event.target.value
            })
        }

    }

    return (

        <Grid container spacing={1} style={{}}>

            <Grid item xs={12} sm={12} lg={12}>
                <Container maxWidth="sm" >
                    <Card className="SettingsCard" >
                        <CardHeader
                            titleTypographyProps={{ variant: 'h6', component: 'h2' }}
                            title={'Routing Dashboard For Core Lightning Node - Connection Settings'}
                            subheader={'Update connection settings for your lightning node. Only Core Lightning supported as of now. LND is not supported.'}
                        />
                        <CardContent>
                            <Grid container spacing={1} className="Item">
                                <Grid item xs={12} className="Item" >
                                    <TextField
                                        id={'NodeId'}
                                        className="Input"
                                        placeholder={'Public Key of the Lightning Node.'}
                                        helperText={'Enter public key of the lightning node. Only Core Lightning Node is supported. LND is not supported.'}
                                        label={'Node Public Key'}
                                        onChange={(e) => handleValueChange(e, 'ID')}
                                        margin="normal"
                                        value={values.nodeid ? values.nodeid : ''}
                                        error={values.nodeid_error}
                                        variant="outlined"
                                        InputLabelProps={{ shrink: true }}

                                    />
                                </Grid>
                                <Grid item xs={12} className="Item" >
                                    <TextField
                                        id={'IPAddress'}
                                        className="Input"
                                        placeholder={'Public IP Address Of the Lightning Node.'}
                                        helperText={'Enter public IP Address of the lightning node.'}
                                        label={'Node IP Address'}
                                        onChange={(e) => handleValueChange(e, 'IP')}
                                        margin="normal"
                                        value={values.ipaddress ? values.ipaddress : ''}
                                        error={values.ipaddress_error}
                                        variant="outlined"
                                        InputLabelProps={{ shrink: true }}

                                    />
                                </Grid>
                                <Grid item xs={12} className="Item" >
                                    <TextField
                                        id={'PortNumber'}
                                        className="Input"
                                        placeholder={'Web Socket Port Number.'}
                                        helperText={'Enter web socket port number of your node. This is different than the port used by lightning network. Make sure the websocket port number is not blocked by firewall. Websocket is enabled by adding this entry to config file, for example: experimental-websocket-port=9999'}

                                        label={'Websocket Port Number'}
                                        onChange={(e) => handleValueChange(e, 'PORT')}
                                        margin="normal"
                                        multiline
                                        value={values.port ? values.port : ''}
                                        error={values.port_error}
                                        variant="outlined"
                                        InputLabelProps={{ shrink: true }}

                                    />
                                </Grid>
                                <Grid item xs={12} className="Item" >
                                    <TextField
                                        id={'Rune'}
                                        className="Input"
                                        placeholder={'Readonly Rune.'}
                                        helperText={'Enter readonly rune. If the rune has any additional access then it will be rejected. The rune is stored in your browser local storage and never touches our server. You can create readonly rune by running this command: lightning-cli commando-rune restrictions=readonly'}
                                        label={'Readonly Rune'}
                                        onChange={(e) => handleValueChange(e, 'RUNE')}
                                        margin="normal"
                                        multiline
                                        value={values.rune ? values.rune : ''}
                                        error={values.rune_error}
                                        variant="outlined"
                                        InputLabelProps={{ shrink: true }}

                                    />
                                </Grid>


                                <Grid item xs={12}  >
                                    <Button variant="outlined" size="small" color="secondary" type="submit" className="SettingButton" onClick={handleCancel}  >
                                        Cancel
                                    </Button>
                                    <Button variant="contained" size="small" type="submit" color="primary" className="SettingsButton" onClick={handleSubmit} >
                                        Save
                                    </Button>
                                    <IconButton
                                        className="DeleteButton"
                                        color="inherit"
                                        aria-label="delete settingsr"
                                        edge="start"
                                        onClick={handleDelete}

                                    >
                                        <Tooltip title='Delete All Settings'>
                                            <DeleteIcon/>
                                        </Tooltip>
                                    </IconButton>

                                </Grid>
                            </Grid>

                        </CardContent>

                    </Card>
                </Container>
            </Grid>
            <Grid item xs={12} sm={12} lg={12}>

            </Grid>


        </Grid>
    );

}

export default Settings;