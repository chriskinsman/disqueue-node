'use strict';

var Promise             = require( 'bluebird' );
var ResponseQueueClient = require( './response-queue-client' );
var ResponderClient     = require( './respond-client' );
var RequesterClient     = require( './request-client' );
var uuid                = require( 'node-uuid' );

function DisqueueHandler ( port, host, options ) {

	return Promise.props( {
		'responseQueueClient' : new ResponseQueueClient( port, host, { 'name' : 'responseQueue' } ),
		'responderClient'     : new ResponderClient( port, host, { 'name' : 'responder' } ),
		'requestClient'       : new RequesterClient( port, host, { 'name' : 'requester' } ),
	} )
	.then( function ( disqueueClients ) {

		// Assign to handler for simplification
		this.disqueueClients     = disqueueClients;
		this.responseQueueClient = disqueueClients.responseQueueClient;
		this.responderClient     = disqueueClients.responderClient;
		this.requestClient       = disqueueClients.requestClient;

		// Create unique queue
		this.responseQueueClient.disqueueClient.createReplyQueue( this.requestClient.disqueueClient, this.responseQueueClient.replyQueue );

		return this;

	}.bind( this ) )

	.catch( function ( error ) {
		console.log( error );
	} );

}

DisqueueHandler.prototype.request = function ( queue, body, timeout ) {

	return new Promise( function ( resolve, reject ) {

		var messageId = uuid.v4();

		var message = JSON.stringify( {
			'replyQueue' : this.responseQueueClient.replyQueue,
			'messageId'  : messageId,
			'body'       : body
		} );

		this.requestClient
			.disqueueClient
			.addJob( queue, message, timeout, function ( error, response ) {

				if ( error ) {
					return reject( error );
				}

				this.responseQueueClient.disqueueClient.on( messageId, function ( errorRespondMessage, respondMessage ) {

					if ( errorRespondMessage ) {
						return reject( new Error( errorRespondMessage ) );
					}

					return resolve( respondMessage );

				} );

			 }.bind( this ) );

	}.bind( this ) );

};

DisqueueHandler.prototype.registerListeners = function ( queue ) {

	this.responderClient.disqueueClient.createQueue( this.requestClient.disqueueClient, queue );

};

DisqueueHandler.prototype.respond = function ( queue, cb ) {

	this.responderClient.disqueueClient.on( queue, cb );

};

module.exports = DisqueueHandler;