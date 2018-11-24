import {Database} from "../interfaces/Database";
import {calculateProgress, getRandomCountry, getRandomVovoideship} from "./ProgressCalculate";
import {Area} from "../interfaces/Area";
import {Position} from "../interfaces/Position";
import {Bet} from "../interfaces/Bet";
import { getDistance }  from "geolib";

export function calculateLottery(db:Database, config:any):void{
    if(calculateProgress(db.bets, Area.VOIVODESHIP, config.VOIVODESHIP_LIMIT) > 1){
        calculateResults(db, Area.VOIVODESHIP, config.VOIVODESHIP_PRIZE, config.MINIMUM_WIN);
    }
    if(calculateProgress(db.bets, Area.COUNTRY, config.COUNTRY_LIMIT) > 1){
        calculateResults(db, Area.COUNTRY, config.COUNTRY_PRIZE, config.MINIMUM_WIN);
    }
}

export function calculateResults(db:Database, type: Area, prize: number, minimumWin: number):void {
    const randomPoint:Position = type === Area.VOIVODESHIP ? getRandomVovoideship() : getRandomCountry();
    const bets = db.bets.filter((bet: Bet) => bet.area === type);
    const oldBets = db.bets.filter((bet: Bet) => bet.area !== type);

    let distanceGlobal = 0;
    const betsScores = bets.map((bet:Bet) => {
        const { lon , lat } = bet.position;
        let distance = getDistance(
            {latitude: randomPoint.lat, longitude: randomPoint.lon},
            {latitude: lat, longitude: lon}
        );
        let range = distance/1000 - bet.distanceFactor ;
        range = range < 0 ? 0 : range;
        return {
            range,
            bet,
            revertRange: 0,
            prize : 0
        };
    });
    const sorted = betsScores.sort((a, b) => (a.range > b.range ? 1 : -1));

    // multiply
    const multipliedSorted = sorted.map((score, index) => {
        score.range = score.range * (1 + (sorted.length - index )/sorted.length);
        distanceGlobal = score.range + distanceGlobal;
        return score;
    });

    let revertDistanceGlobal = 0;
    const factors = multipliedSorted.map((score) => {
        score.revertRange =  distanceGlobal / score.range;
        revertDistanceGlobal = revertDistanceGlobal + score.revertRange;
        return score;
    });
    let totalPrizes = 0;


    const prizes = factors.filter((factor) => {
        const betPrize = (factor.revertRange / revertDistanceGlobal * prize);

        factor.prize = betPrize >= minimumWin ? Math.floor(betPrize * 100 ) / 100 : 0;
        totalPrizes = totalPrizes + factor.prize;
        return factor.prize;
    });

    const id:string = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
    db.results.push({
        id: id,
        position: randomPoint,
        time: Date.now(),
        winners: prizes.map((score) => {
            return {
              userId: score.bet.userId,
              prize: score.prize,
              distance: score.range
            };
        }),
        winnersTotal: prizes.length,
        betsTotal: bets.length,
        total: totalPrizes
    });
    db.betsArchive = db.betsArchive.concat(bets);
    db.bets = oldBets;
}