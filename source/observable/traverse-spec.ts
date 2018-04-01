/**
 * @license Use of this source code is governed by an MIT-style license that
 * can be found in the LICENSE file at https://github.com/cartant/rxjs-etc
 */
/*tslint:disable:no-unused-expression*/

import { expect } from "chai";
import { Observable, ObservableInput } from "rxjs/Observable";
import { concat } from "rxjs/observable/concat";
import { empty } from "rxjs/observable/empty";
import { from } from "rxjs/observable/from";
import { of } from "rxjs/observable/of";
import { merge } from "rxjs/observable/merge";
import { delay } from "rxjs/operators/delay";
import { map } from "rxjs/operators/map";
import { IScheduler } from "rxjs/Scheduler";
import { Subject } from "rxjs/Subject";
import { marbles } from "rxjs-marbles";
import { traverse } from "./traverse";

describe("observable/traverse", () => {

    describe("general", () => {

        const createProducer = (max: number = Infinity, count?: number, time?: number, scheduler?: IScheduler) =>
            (marker: number | undefined): Observable<{ markers: number[], values: ObservableInput<string> }> => {
                const at = (marker === undefined) ? 0 : marker + 1;
                const markers = [at];
                const values: string[] = [];
                for (let c = 0; c < (count || 1); ++c) {
                    values.push((at + c).toString());
                }
                const source = (at <= max) ? of({ markers, values }) : empty<never>();
                return (time !== undefined) && (scheduler !== undefined) ?
                    source.pipe(delay(time, scheduler)) :
                    source;
            };

        it("should complete if there is no data", marbles((m) => {

            const notifier =  m.hot("--n--|");
            const notifierSubs =    "^----!";
            const expected = m.cold("-----|");

            const producer = createProducer(-1, 1, m.time("-----|"), m.scheduler);
            const traversed = traverse(producer, notifier);
            m.expect(traversed).toBeObservable(expected);
            m.expect(notifier).toHaveSubscriptions(notifierSubs);
        }));

        it("should traverse the first chunk of data", marbles((m) => {

            const notifier =  m.hot("--");
            const expected = m.cold("0-");

            const producer = createProducer();
            const traversed = traverse(producer, notifier);
            m.expect(traversed).toBeObservable(expected);
        }));

        it("should traverse further chunks in response to the notifier", marbles((m) => {

            const notifier =  m.hot("--n----n--n--");
            const expected = m.cold("0-1----2--3--");

            const producer = createProducer();
            const traversed = traverse(producer, notifier);
            m.expect(traversed).toBeObservable(expected);
        }));

        it("should flatten values within chunks", marbles((m) => {

            const notifier =  m.hot("-----n-------n-----n-----");
            const expected = m.cold("(01)-(12)----(23)--(34)--");

            const producer = createProducer(Infinity, 2);
            const traversed = traverse(producer, notifier);
            m.expect(traversed).toBeObservable(expected);
        }));

        it("should queue notifications", marbles((m) => {

            const notifier =  m.hot("-nn------------");
            const expected = m.cold("----0---1---2--");

            const producer = createProducer(Infinity, 1, m.time("----|"), m.scheduler);
            const traversed = traverse(producer, notifier);
            m.expect(traversed).toBeObservable(expected);
        }));

        it("should traverse without a notifier", marbles((m) => {

            const expected = m.cold("----0---1---2---|");

            const producer = createProducer(2, 1, m.time("----|"), m.scheduler);
            const traversed = traverse(producer);
            m.expect(traversed).toBeObservable(expected);
        }));

        it("should traverse with a consumer", marbles((m) => {

            const other =    m.cold("|");
            const subs = [
                                    "----(^!)---------",
                                    "--------(^!)-----",
                                    "------------(^!)-"
            ];
            const expected = m.cold("----0---1---2---|");

            const producer = createProducer(2, 1, m.time("----|"), m.scheduler);
            const traversed = traverse(producer, source => concat(source, other));
            m.expect(traversed).toBeObservable(expected);
            m.expect(other).toHaveSubscriptions(subs);
        }));

        it("should traverse with asynchonous consumers", marbles((m) => {

            const other =    m.cold("----|");
            const subs = [
                                    "^---!-------",
                                    "----^---!---",
                                    "--------^---!"
            ];
            const expected = m.cold("0---1---2---|");

            const producer = createProducer(2);
            const traversed = traverse(producer, source => concat(source, other));
            m.expect(traversed).toBeObservable(expected);
            m.expect(other).toHaveSubscriptions(subs);
        }));

        it("should traverse graphs with a notifier", marbles((m) => {

            const data = {
                a: {
                    d: {},
                    e: {}
                },
                b: {
                    f: {}
                },
                c: {}
            };

            const notifier =  m.hot("------n-----n--");
            const expected = m.cold("(abc)-(de)--f--");

            const producer = (marker: any, index: number) => {
                const node = (index === 0) ? data : marker;
                const pairs = Object.keys(node).map(key => ({ markers: [node[key]], values: [key] }));
                return from(pairs);
            };

            const traversed = traverse(producer, notifier);
            m.expect(traversed).toBeObservable(expected);
        }));

        it("should serialize production", marbles((m) => {

            const values = {
                w: { markers: ["x", "y", "z"], values: [] },
                x: { markers: [], values: ["a", "b"] },
                y: { markers: [], values: ["c", "d"] },
                z: { markers: [], values: ["e", "f"] }
            };

            const w = m.cold("(w|)", values);
            const x = m.cold("x----|", values);
            const y = m.cold("y----|", values);
            const z = m.cold("z----|", values);

            const expected = m.cold("-----(ab)-(cd)-(ef|)");
            const xSubs =           "^----!--------------";
            const ySubs =           "-----^----!---------";
            const zSubs =           "----------^----!----";

            const producer = (marker: string | undefined, index: number) => {
                switch (marker) {
                case undefined:
                    return w;
                case "x":
                    return x;
                case "y":
                    return y;
                case "z":
                    return z;
                default:
                    return empty<never>();
                }
            };

            const traversed = traverse(producer);
            m.expect(traversed).toBeObservable(expected);
            m.expect(x).toHaveSubscriptions(xSubs);
            m.expect(y).toHaveSubscriptions(ySubs);
            m.expect(z).toHaveSubscriptions(zSubs);
        }));

        it("should queue notifications for graphs", marbles((m) => {

            const data = {
                a: {
                    d: {},
                    e: {}
                },
                b: {
                    f: {}
                },
                c: {}
            };

            const notifier =  m.hot("nn-----------------");
            const expected = m.cold("------(abc)-(def)--");

            const producer = (marker: any, index: number) => {
                const node = (index === 0) ? data : marker;
                const pairs = Object.keys(node).map(key => ({ markers: [node[key]], values: [key] }));
                return pairs.length ?
                    from(pairs).pipe(delay(m.time("------|"), m.scheduler)) :
                    empty<never>();
            };

            const traversed = traverse(producer, notifier);
            m.expect(traversed).toBeObservable(expected);
        }));

        it("should traverse graphs without a notifier", marbles((m) => {

            const data = {
                a: {
                    d: {},
                    e: {}
                },
                b: {
                    f: {}
                },
                c: {}
            };

            const expected = m.cold("------(abc)-(de)--(f|)");

            const producer = (marker: any, index: number) => {
                const node = (index === 0) ? data : marker;
                const pairs = Object.keys(node).map(key => ({ markers: [node[key]], values: [key] }));
                return pairs.length ?
                    from(pairs).pipe(delay(m.time("------|"), m.scheduler)) :
                    empty<never>();
            };

            const traversed = traverse(producer);
            m.expect(traversed).toBeObservable(expected);
        }));

        it("should preserve the order", marbles((m) => {

            const expected = m.cold("------a-b---(c|)");

            const producer = (marker: any, index: number) => {
                return (index === 0) ? merge(
                    of({ markers: [], values: of("a").pipe(delay(m.time("------|"), m.scheduler)) }),
                    of({ markers: [], values: of("b").pipe(delay(m.time("--|"), m.scheduler)) }),
                    of({ markers: [], values: of("c").pipe(delay(m.time("----|"), m.scheduler)) })
                ) : empty<never>();
            };

            const traversed = traverse(producer);
            m.expect(traversed).toBeObservable(expected);
        }));
    });

    describe("GitHub usage example", () => {

        function get(url: string): Observable<{
            content: { html_url: string }[],
            next: string | null
        }> {

            // The next URL would be obtained from the Link header.
            // https://blog.angularindepth.com/rxjs-understanding-expand-a5f8b41a3602

            switch (url) {
            case "https://api.github.com/users/cartant/repos":
                return of({
                    content: [{
                        html_url: "https://github.com/cartant/rxjs-etc"
                    }, {
                        html_url: "https://github.com/cartant/rxjs-marbles"
                    }],
                    next: "https://api.github.com/users/cartant/repos?page=2"
                });
            case "https://api.github.com/users/cartant/repos?page=2":
                return of({
                    content: [{
                        html_url: "https://github.com/cartant/rxjs-spy"
                    }, {
                        html_url: "https://github.com/cartant/rxjs-tslint-rules"
                    }],
                    next: null
                });
            default:
                throw new Error("Unexpected URL.");
            }
        }

        describe("with notifier", () => {

            it("should traverse the pages", (callback: any) => {

                const notifier = new Subject<any>();
                const urls = traverse(
                    (marker?: string) => get(marker || "https://api.github.com/users/cartant/repos").pipe(
                        map(response => ({
                            markers: response.next ? [response.next] : [],
                            values: response.content
                        }))
                    ),
                    notifier
                ).pipe(
                    map(repo => repo.html_url)
                );

                const received: string[] = [];
                urls.subscribe(
                    url => received.push(url),
                    callback,
                    () => {
                        expect(received).to.deep.equal([
                            "https://github.com/cartant/rxjs-etc",
                            "https://github.com/cartant/rxjs-marbles",
                            "https://github.com/cartant/rxjs-spy",
                            "https://github.com/cartant/rxjs-tslint-rules"
                        ]);
                        callback();
                    }
                );
                notifier.next();
            });
        });

        describe("with consumer", () => {

            it("should traverse the pages", (callback: any) => {

                const urls = traverse(
                    (marker?: string) => get(marker || "https://api.github.com/users/cartant/repos").pipe(
                        map(response => ({
                            markers: response.next ? [response.next] : [],
                            values: response.content
                        }))
                    ),
                    source => source.pipe(
                        map(repo => repo.html_url)
                    )
                );

                const received: string[] = [];
                urls.subscribe(
                    url => received.push(url),
                    callback,
                    () => {
                        expect(received).to.deep.equal([
                            "https://github.com/cartant/rxjs-etc",
                            "https://github.com/cartant/rxjs-marbles",
                            "https://github.com/cartant/rxjs-spy",
                            "https://github.com/cartant/rxjs-tslint-rules"
                        ]);
                        callback();
                    }
                );
            });
        });
    });
});