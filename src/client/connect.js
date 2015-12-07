/*

Note the mapping for sending keydown and keyup is as follows:

		keydown		keyup
Up 		0			4	
Down 	1			5
Left 	2			6
Right	3			7

*/

import BSON from '../common/communication/bson';
import Controller from './ui/controller';
import Event from '../common/state/event';
import Game from '../common/game/game';
import GameMapState from '../common/game/game_map_state';
import GameState from '../common/state/state';
import UI from './ui/ui';
import Util from '../common/util/util';
import Vector from '../common/util/vector';

const local_server_URI = 'http://localhost:3000';
const remote_server_URI = 'http://tankti.me:3000';

class Connect_Class
{
	constructor()
	{
		// Events to be sent to server
		this.state_queue = new Map();

		this.socket = io( local_server_URI );
		this.socket.on( 'connect', this.connect_handler.bind( this ) );
		this.socket.on( 'connect_error', this.connect_error_handler.bind( this ) );

		Event.subscribe( 'controller_aim', this.pushStateEvent.bind( this, 'm' ) );
		Event.subscribe( 'controller_shoot', this.pushStateEvent.bind( this, 'c' ) );
		Event.subscribe( 'controller_up', this.pushStateEvent.bind( this, 'v', -1 ) );
		Event.subscribe( 'controller_down', this.pushStateEvent.bind( this, 'v', 1 ) );
		Event.subscribe( 'controller_no_move', this.pushStateEvent.bind( this, 'v', 0 ) );
		Event.subscribe( 'controller_left', this.pushStateEvent.bind( this, 'r', 1 ) );
		Event.subscribe( 'controller_right', this.pushStateEvent.bind( this, 'r', -1 ) );
		Event.subscribe( 'controller_no_turn', this.pushStateEvent.bind( this, 'r', 0 ) );

		GameState.onload = this.sync_handler.bind( this );
		GameState.onterminate = this.close_socket.bind( this );
	}

	// Add an event to the queue to be sent to the server
	pushStateEvent( key, data )
	{
		this.state_queue.set( key, data );
	}

	// Send the queue of events to the server
	send_state_queue()
	{
		if ( this.state_queue.size === 0 )
			return;

		if ( !GameState.is( 'playing' ) )
			return;

		// Convert this damn thing to an object
		let state_queue_object = {
			t: String( Util.timestamp() )
		};
		for ( let [ key, data ] of this.state_queue.entries() )
		{
			state_queue_object[ key ] = data;
		}

		this.socket.emit( 'e', BSON.encode( state_queue_object ) );
		this.state_queue.clear();
	};

	close_socket()
	{
		if ( this.socket )
			this.socket.close();
	}

	connect_handler()
	{
		GameState.connect();
		this.socket.on( 'disconnect', this.disconnect_handler.bind( this ) );
	}

	// Attempt different servers if failed to connect to this one
	connect_error_handler()
	{
		if ( this.socket.io.uri === local_server_URI )
			this.socket.io.uri = remote_server_URI;
		else
			this.socket.io.uri = local_server_URI;
	}

	sync_handler()
	{
		// Tell server to send game state
		this.socket.emit( 'handshake', UI.name );

		// Receive server's game state
		this.socket.on( 'handshake', this.handshake_handler.bind( this ) );

		// Listen for server's events
		this.socket.on( 'e', this.event_handler.bind( this ) );
	}

	handshake_handler( data )
	{
		console.log( data );
		let game_map = GameMapState.decode( data, Game.game_map );
		let player = game_map.tanks.get( this.socket.id );

		if ( !player )
		{
			this.socket.emit( 'handshake', UI.name );
			return;
		}

		game_map.grid = data.grid;
		game_map.controller = new Controller( player );

		GameState.play();
	}

	disconnect_handler()
	{
		GameState.disconnect();
		console.log( GameState.current );
	}

	event_handler( data )
	{
		let game_map = Game.game_map;

		if ( !game_map )
			return;

		if ( !game_map.controller )
			return;

		data = BSON.decode( data );

		for ( var id in data.t )
		{
			var tank = data.t[ id ];

			if ( tank === 'remove' )
			{
				game_map.remove_tank( id );
				continue;
			}

			if ( 'add' in tank )
			{
				let tankData = tank.add;

				if ( id === this.socket.id )
				{
					continue;
				}

				let tank_instance = game_map.spawn_tank( id, tankData.x, tankData.y, tankData.a );
				tank_instance.set_speed( tankData.s );
				tank_instance.turn_barrel_to( tankData.f );

				continue;
			}

			if ( 'x' in tank )
			{
				let tank_instance = game_map.tanks.get( id );
				tank_instance.next_pos.x = tank.x - tank_instance.pos.x;
			}

			if ( 'y' in tank )
			{
				let tank_instance = game_map.tanks.get( id );
				tank_instance.next_pos.y = tank.y - tank_instance.pos.y;
			}

			if ( 'a' in tank )
			{
				let tank_instance = game_map.tanks.get( id );
				tank_instance.turn_to( tank.a );
			}

			if ( 'f' in tank )
			{
				let tank_instance = game_map.tanks.get( id );
				tank_instance.turn_barrel_to( tank.f );
			}

			if ( 's' in tank )
			{
				let tank_instance = game_map.tanks.get( id );
				tank_instance.set_speed( tank.s );
			}
		}

		for ( var id in data.b )
		{
			var bullet = data.b[ id ];

			if ( bullet === 'remove' )
			{
				game_map.remove_bullet( id );
				continue;
			}

			if ( 'add' in bullet )
			{
				var bulletData = bullet.add;
				game_map.spawn_bullet( id, bulletData.x, bulletData.y, bulletData.a, bulletData.o );
				console.log( game_map.bullets.get( id ) );
			}

		}
	}
}

var Connect = new Connect_Class();
export default Connect;