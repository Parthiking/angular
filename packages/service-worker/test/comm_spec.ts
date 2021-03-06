/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {PLATFORM_ID} from '@angular/core';
import {TestBed} from '@angular/core/testing';

import {NgswCommChannel} from '../src/low_level';
import {RegistrationOptions, ngswCommChannelFactory} from '../src/module';
import {SwPush} from '../src/push';
import {SwUpdate} from '../src/update';
import {MockServiceWorkerContainer, MockServiceWorkerRegistration} from '../testing/mock';

{
  describe('ServiceWorker library', () => {
    let mock: MockServiceWorkerContainer;
    let comm: NgswCommChannel;
    beforeEach(() => {
      mock = new MockServiceWorkerContainer();
      comm = new NgswCommChannel(mock as any);
    });
    describe('NgswCommsChannel', () => {
      it('can access the registration when it comes before subscription', (done: DoneFn) => {
        const mock = new MockServiceWorkerContainer();
        const comm = new NgswCommChannel(mock as any);
        const regPromise = mock.getRegistration() as any as MockServiceWorkerRegistration;

        mock.setupSw();

        (comm as any).registration.subscribe((reg: any) => { done(); });
      });
      it('can access the registration when it comes after subscription', (done: DoneFn) => {
        const mock = new MockServiceWorkerContainer();
        const comm = new NgswCommChannel(mock as any);
        const regPromise = mock.getRegistration() as any as MockServiceWorkerRegistration;

        (comm as any).registration.subscribe((reg: any) => { done(); });

        mock.setupSw();
      });
    });
    describe('ngswCommChannelFactory', () => {
      it('gives disabled NgswCommChannel for platform-server', () => {
        TestBed.configureTestingModule({
          providers: [
            {provide: PLATFORM_ID, useValue: 'server'},
            {provide: RegistrationOptions, useValue: {enabled: true}}, {
              provide: NgswCommChannel,
              useFactory: ngswCommChannelFactory,
              deps: [RegistrationOptions, PLATFORM_ID]
            }
          ]
        });

        expect(TestBed.get(NgswCommChannel).isEnabled).toEqual(false);
      });
      it('gives disabled NgswCommChannel when \'enabled\' option is false', () => {
        TestBed.configureTestingModule({
          providers: [
            {provide: PLATFORM_ID, useValue: 'browser'},
            {provide: RegistrationOptions, useValue: {enabled: false}}, {
              provide: NgswCommChannel,
              useFactory: ngswCommChannelFactory,
              deps: [RegistrationOptions, PLATFORM_ID]
            }
          ]
        });

        expect(TestBed.get(NgswCommChannel).isEnabled).toEqual(false);
      });
      it('gives disabled NgswCommChannel when navigator.serviceWorker is undefined', () => {
        TestBed.configureTestingModule({
          providers: [
            {provide: PLATFORM_ID, useValue: 'browser'},
            {provide: RegistrationOptions, useValue: {enabled: true}},
            {
              provide: NgswCommChannel,
              useFactory: ngswCommChannelFactory,
              deps: [RegistrationOptions, PLATFORM_ID],
            },
          ],
        });

        const context: any = global || window;
        const originalDescriptor = Object.getOwnPropertyDescriptor(context, 'navigator');
        const patchedDescriptor = {value: {serviceWorker: undefined}, configurable: true};

        try {
          // Set `navigator` to `{serviceWorker: undefined}`.
          Object.defineProperty(context, 'navigator', patchedDescriptor);
          expect(TestBed.get(NgswCommChannel).isEnabled).toBe(false);
        } finally {
          if (originalDescriptor) {
            Object.defineProperty(context, 'navigator', originalDescriptor);
          } else {
            delete context.navigator;
          }
        }
      });
      it('gives enabled NgswCommChannel when browser supports SW and enabled option is true',
         () => {
           TestBed.configureTestingModule({
             providers: [
               {provide: PLATFORM_ID, useValue: 'browser'},
               {provide: RegistrationOptions, useValue: {enabled: true}}, {
                 provide: NgswCommChannel,
                 useFactory: ngswCommChannelFactory,
                 deps: [RegistrationOptions, PLATFORM_ID]
               }
             ]
           });

           const context: any = global || window;
           const originalDescriptor = Object.getOwnPropertyDescriptor(context, 'navigator');
           const patchedDescriptor = {value: {serviceWorker: mock}, configurable: true};

           try {
             // Set `navigator` to `{serviceWorker: mock}`.
             Object.defineProperty(context, 'navigator', patchedDescriptor);
             expect(TestBed.get(NgswCommChannel).isEnabled).toBe(true);
           } finally {
             if (originalDescriptor) {
               Object.defineProperty(context, 'navigator', originalDescriptor);
             } else {
               delete context.navigator;
             }
           }
         });
    });
    describe('SwPush', () => {
      let push: SwPush;
      beforeEach(() => {
        push = new SwPush(comm);
        mock.setupSw();
      });
      it('receives push messages', (done: DoneFn) => {
        push.messages.subscribe(msg => {
          expect(msg).toEqual({
            message: 'this was a push message',
          });
          done();
        });
        mock.sendMessage({
          type: 'PUSH',
          data: {
            message: 'this was a push message',
          },
        });
      });
      it('is injectable', () => {
        TestBed.configureTestingModule({
          providers: [
            SwPush,
            {provide: NgswCommChannel, useValue: comm},
          ]
        });
        expect(() => TestBed.get(SwPush)).not.toThrow();
      });
      describe('with no SW', () => {
        beforeEach(() => { comm = new NgswCommChannel(undefined); });
        it('can be instantiated', () => { push = new SwPush(comm); });
        it('does not crash on subscription to observables', () => {
          push = new SwPush(comm);
          push.messages.toPromise().catch(err => fail(err));
          push.subscription.toPromise().catch(err => fail(err));
        });
        it('gives an error when registering', done => {
          push = new SwPush(comm);
          push.requestSubscription({serverPublicKey: 'test'}).catch(err => { done(); });
        });
        it('gives an error when unsubscribing', done => {

          push = new SwPush(comm);
          push.unsubscribe().catch(err => { done(); });
        });
      });
    });
    describe('SwUpdate', () => {
      let update: SwUpdate;
      beforeEach(() => {
        update = new SwUpdate(comm);
        mock.setupSw();
      });
      it('processes update availability notifications when sent', (done: DoneFn) => {
        update.available.subscribe(event => {
          expect(event.current).toEqual({version: 'A'});
          expect(event.available).toEqual({version: 'B'});
          expect(event.type).toEqual('UPDATE_AVAILABLE');
          done();
        });
        mock.sendMessage({
          type: 'UPDATE_AVAILABLE',
          current: {
            version: 'A',
          },
          available: {
            version: 'B',
          },
        });
      });
      it('processes update activation notifications when sent', (done: DoneFn) => {
        update.activated.subscribe(event => {
          expect(event.previous).toEqual({version: 'A'});
          expect(event.current).toEqual({version: 'B'});
          expect(event.type).toEqual('UPDATE_ACTIVATED');
          done();
        });
        mock.sendMessage({
          type: 'UPDATE_ACTIVATED',
          previous: {
            version: 'A',
          },
          current: {
            version: 'B',
          },
        });
      });
      it('activates updates when requested', (done: DoneFn) => {
        mock.messages.subscribe((msg: {action: string, statusNonce: number}) => {
          expect(msg.action).toEqual('ACTIVATE_UPDATE');
          mock.sendMessage({
            type: 'STATUS',
            nonce: msg.statusNonce,
            status: true,
          });
        });
        return update.activateUpdate().then(() => done()).catch(err => done.fail(err));
      });
      it('reports activation failure when requested', (done: DoneFn) => {
        mock.messages.subscribe((msg: {action: string, statusNonce: number}) => {
          expect(msg.action).toEqual('ACTIVATE_UPDATE');
          mock.sendMessage({
            type: 'STATUS',
            nonce: msg.statusNonce,
            status: false,
            error: 'Failed to activate',
          });
        });
        return update.activateUpdate()
            .catch(err => { expect(err.message).toEqual('Failed to activate'); })
            .then(() => done())
            .catch(err => done.fail(err));
      });
      it('is injectable', () => {
        TestBed.configureTestingModule({
          providers: [
            SwUpdate,
            {provide: NgswCommChannel, useValue: comm},
          ]
        });
        expect(() => TestBed.get(SwUpdate)).not.toThrow();
      });
      describe('with no SW', () => {
        beforeEach(() => { comm = new NgswCommChannel(undefined); });
        it('can be instantiated', () => { update = new SwUpdate(comm); });
        it('does not crash on subscription to observables', () => {
          update = new SwUpdate(comm);
          update.available.toPromise().catch(err => fail(err));
          update.activated.toPromise().catch(err => fail(err));
        });
        it('gives an error when checking for updates', done => {
          update = new SwUpdate(comm);
          update.checkForUpdate().catch(err => { done(); });
        });
        it('gives an error when activating updates', done => {
          update = new SwUpdate(comm);
          update.activateUpdate().catch(err => { done(); });
        });
      });
    });
  });
}
